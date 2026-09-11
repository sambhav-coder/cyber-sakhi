import bcrypt from "bcryptjs";
import crypto from "crypto";
import { AppUser, UserRole } from "@/lib/authTypes";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isUniqueViolation, throwIfError } from "./errors";
import type { ProfileRow } from "./types";
import { generateSakhiNumber } from "@/lib/sakhiNumber";

const SEED_PASSWORD_ROUNDS = 10;

type ProfileRecord = ProfileRow & {
  passwordHash?: string | null;
};

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

function toDbRole(role: UserRole): string {
  return role === "ADMIN" ? "admin" : "user";
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
    name: String(row.full_name ?? ""),
    email: String(row.email),
    passwordHash: passwordHash || undefined,
    role: String(row.role ?? "").toUpperCase() === "ADMIN" ? "ADMIN" : "USER",
    sakhiNumber: row.sakhi_number || undefined,
    age: row.age ?? undefined,
    city: row.city ?? undefined,
    phone: row.phone ?? undefined,
    createdAt: String(row.created_at || new Date().toISOString()),
  };
}

/**
 * Profiles rows are foreign-keyed to auth.users(id). This helper makes sure
 * a matching Supabase Auth user exists so the profile insert never hits a
 * FK violation. The throwaway password is never returned, logged, or needed:
 * application login verifies against profiles.password_hash (bcrypt) only.
 * When a real id is supplied (e.g. a profile update), it is used as-is.
 */
async function ensureAuthUser(data: {
  id?: string;
  name: string;
  email: string;
  age?: string | null;
  city?: string | null;
  phone?: string | null;
}): Promise<string> {
  if (data.id) return data.id;

  const email = normalizeEmail(data.email);
  const { data: created, error } = await getSupabaseServer().auth.admin.createUser({
    email,
    password: crypto.randomBytes(24).toString("base64"),
    email_confirm: true,
    user_metadata: {
      full_name: data.name,
      age: data.age ?? null,
      city: data.city ?? null,
      phone: data.phone ?? null,
    },
  });

  if (error) {
    if (error.code === "email_exists" || /already registered/i.test(error.message || "")) {
      // Recover from an auth.user orphan (no profile row): reuse its uuid.
      const { data: users } = await getSupabaseServer().auth.admin.listUsers({
        perPage: 1000,
      });
      const found = (users?.users || []).find(
        (u) => u.email?.toLowerCase() === email
      );
      if (found?.id) {
        return found.id;
      }
      throw new Error("A user with this email address already exists.");
    }
    throwIfError(error, "Failed to create user account.");
  }

  if (!created?.user?.id) {
    throw new Error("Failed to create user account.");
  }
  return created.user.id;
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

export async function findProfileBySakhiNumber(
  sakhiNumber: string
): Promise<AppUser | undefined> {
  const { data, error } = await getSupabaseServer()
    .from("profiles")
    .select("*")
    .eq("sakhi_number", sakhiNumber)
    .maybeSingle();

  throwIfError(error, "Failed to look up profile by Sakhi Number.");
  if (!data) return undefined;
  return mapProfile(data as ProfileRecord);
}

export async function updateProfilePassword(
  userId: string,
  passwordHash: string
): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("profiles")
    .update({ password_hash: passwordHash })
    .eq("id", userId);

  throwIfError(error, "Failed to update profile password.");
}

/**
 * Complete a pending OAuth profile (age step): stores the mandatory age plus
 * the optional city/phone, the password hash, and a display name.
 */
export async function updateProfileDetails(
  userId: string,
  data: {
    full_name?: string;
    age?: string | null;
    city?: string | null;
    phone?: string | null;
    passwordHash?: string | null;
  }
): Promise<AppUser> {
  const payload: Record<string, unknown> = {
    full_name: data.full_name,
    age: data.age ?? null,
    city: data.city ?? null,
    phone: data.phone ?? null,
  };
  if (data.passwordHash !== undefined) {
    payload.password_hash = data.passwordHash;
  }

  const { data: updated, error } = await getSupabaseServer()
    .from("profiles")
    .update(payload)
    .eq("id", userId)
    .select("*")
    .single();

  throwIfError(error, "Failed to update profile details.");
  return mapProfile(updated as ProfileRecord);
}

export async function createProfile(data: {
  name: string;
  email: string;
  passwordHash?: string | null;
  role?: UserRole;
  age?: string | null;
  city?: string | null;
  phone?: string | null;
  id?: string;
}): Promise<AppUser> {
  const email = normalizeEmail(data.email);
  const role: UserRole = data.role || (isAdminEmail(email) ? "ADMIN" : "USER");
  const sakhiNumber = generateSakhiNumber();

  const id = await ensureAuthUser(data);
  const dbRole = toDbRole(role);

  const MAX_RETRIES = 5;
  let inserted: ProfileRecord | null = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const workingSakhi = attempt === 0 ? sakhiNumber : generateSakhiNumber();
    const { data: row, error } = await getSupabaseServer()
      .from("profiles")
      .insert({
        id,
        email,
        full_name: data.name.trim(),
        role: dbRole,
        password_hash: data.passwordHash ?? null,
        sakhi_number: workingSakhi,
        age: data.age ?? null,
        city: data.city ?? null,
        phone: data.phone ?? null,
      })
      .select("*")
      .single();

    if (!error) {
      inserted = row as ProfileRecord;
      break;
    }

    if (isUniqueViolation(error) && attempt < MAX_RETRIES - 1) {
      continue;
    }

    lastError = error;
    break;
  }

  if (!inserted) {
    if (isUniqueViolation(lastError)) {
      const msg = lastError?.message || "";
      if (msg.includes("email") || msg.includes("profiles_email")) {
        throw new Error("A user with this email address already exists.");
      }
      throw new Error("Failed to generate a unique Sakhi Number. Please try again.");
    }
    throwIfError(lastError, "Failed to create profile.");
  }

  return mapProfile(inserted as ProfileRecord);
}

export async function upsertOAuthProfile(data: {
  email: string;
  name: string;
}): Promise<AppUser> {
  const email = normalizeEmail(data.email);

  const existing = await findProfileByEmail(email);
  const role: UserRole = isAdminEmail(email) ? "ADMIN" : existing?.role || "USER";

  if (existing) {
    const { data: updated, error } = await getSupabaseServer()
      .from("profiles")
      .update({
        full_name: data.name.trim() || existing.name,
        role: toDbRole(role),
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    throwIfError(error, "Failed to update OAuth profile.");
    return mapProfile(updated as ProfileRecord);
  }

  return createProfile({
    name: data.name.trim() || email,
    email,
    passwordHash: null,
    role,
  });
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