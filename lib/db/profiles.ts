import bcrypt from "bcryptjs";
import { AppUser, UserRole } from "@/lib/authTypes";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isUniqueViolation, throwIfError } from "./errors";
import type { ProfileRow } from "./types";
import { generateSakhiNumber } from "@/lib/sakhiNumber";

const SEED_PASSWORD_ROUNDS = 10;

type ProfileRecord = ProfileRow & {
  full_name?: string | null;
  passwordHash?: string | null;
};

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  const envAdmins = (process.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (envAdmins.includes(normalized)) return true;
  if (normalized === "admin@cybersakhi.org") return true;
  return false;
}

function mapProfile(row: ProfileRecord): AppUser {
  const passwordHash = row.password_hash ?? row.passwordHash ?? undefined;
  return {
    id: String(row.id),
    name: String(row.name ?? row.full_name ?? ""),
    email: String(row.email),
    passwordHash: passwordHash || undefined,
    role: row.role === "ADMIN" ? "ADMIN" : "USER",
    image: row.image || undefined,
    sakhiNumber: row.sakhi_number || undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

export async function findProfileByEmail(
  email: string
): Promise<AppUser | undefined> {
  const { data, error } = await getSupabaseServer()
    .from("profiles")
    .select("*")
    .eq("email", normalizeEmail(email))
    .maybeSingle();

  throwIfError(error, "Failed to look up profile by email.");
  if (!data) return undefined;
  return mapProfile(data as ProfileRecord);
}

export async function findProfileById(id: string): Promise<AppUser | undefined> {
  const { data, error } = await getSupabaseServer()
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  throwIfError(error, "Failed to look up profile by id.");
  if (!data) return undefined;
  return mapProfile(data as ProfileRecord);
}

export async function createProfile(data: {
  name: string;
  email: string;
  passwordHash?: string | null;
  image?: string | null;
  role?: UserRole;
}): Promise<AppUser> {
  const email = normalizeEmail(data.email);
  const role: UserRole = data.role || (isAdminEmail(email) ? "ADMIN" : "USER");
  const sakhiNumber = generateSakhiNumber();

  const { data: inserted, error } = await getSupabaseServer()
    .from("profiles")
    .insert({
      email,
      name: data.name.trim(),
      role,
      password_hash: data.passwordHash ?? null,
      image: data.image ?? null,
      sakhi_number: sakhiNumber,
    })
    .select("*")
    .single();

  if (isUniqueViolation(error)) {
    throw new Error("A user with this email address already exists.");
  }

  throwIfError(error, "Failed to create profile.");
  return mapProfile(inserted as ProfileRecord);
}

export async function upsertOAuthProfile(data: {
  email: string;
  name: string;
  image?: string | null;
}): Promise<AppUser> {
  const email = normalizeEmail(data.email);
  console.log("[Supabase] upsertOAuthProfile called for email:", email);
  
  const existing = await findProfileByEmail(email);
  const role: UserRole = isAdminEmail(email) ? "ADMIN" : existing?.role || "USER";
  console.log("[Supabase] Profile check - existing:", !!existing, "role:", role);

  if (existing) {
    console.log("[Supabase] Updating existing profile id:", existing.id);
    const { data: updated, error } = await getSupabaseServer()
      .from("profiles")
      .update({
        name: data.name.trim() || existing.name,
        image: data.image ?? existing.image ?? null,
        role,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    throwIfError(error, "Failed to update OAuth profile.");
    console.log("[Supabase] Profile updated successfully - id:", updated.id);
    return mapProfile(updated as ProfileRecord);
  }

  console.log("[Supabase] Creating new profile for email:", email);
  const newProfile = await createProfile({
    name: data.name.trim() || email,
    email,
    image: data.image ?? null,
    passwordHash: null,
    role,
  });
  console.log("[Supabase] New profile created - id:", newProfile.id);
  return newProfile;
}

let seedPromise: Promise<void> | null = null;

/**
 * Inserts the historical demo accounts into profiles if they are missing.
 * This is real database persistence, not an in-memory user store.
 */
export async function ensureSeedProfiles(): Promise<void> {
  if (!seedPromise) {
    seedPromise = (async () => {
      const seeds: Array<{ name: string; email: string; password: string; role: UserRole }> =
        [
          {
            name: "Cyber Sakhi Safety Admin",
            email: "admin@cybersakhi.org",
            password: "Admin@Sakhi2026!",
            role: "ADMIN",
          },
          {
            name: "Ananya Sharma",
            email: "user@cybersakhi.org",
            password: "User@Sakhi2026!",
            role: "USER",
          },
        ];

      for (const seed of seeds) {
        const existing = await findProfileByEmail(seed.email);
        if (existing) continue;

        const passwordHash = await bcrypt.hash(seed.password, SEED_PASSWORD_ROUNDS);
        try {
          await createProfile({
            name: seed.name,
            email: seed.email,
            passwordHash,
            role: seed.role,
          });
        } catch (error) {
          if (
            error instanceof Error &&
            error.message === "A user with this email address already exists."
          ) {
            continue;
          }
          throw error;
        }
      }
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }

  return seedPromise;
}
