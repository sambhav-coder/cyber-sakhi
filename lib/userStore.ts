import bcrypt from "bcryptjs";
import { AppUser, UserRole } from "./authTypes";
import {
  createProfile,
  ensureSeedProfiles,
  findProfileByEmail,
  findProfileById,
  findProfileBySakhiNumber,
  isAdminEmail as profileIsAdminEmail,
} from "./db/profiles";

export { isAdminEmail } from "./db/profiles";

const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";
const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.<>?";

function secureRandomInt(max: number): number {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  }
  return Math.floor(Math.random() * max);
}

export function generateSecurePassword(): string {
  const length = 14;
  const allChars = UPPERCASE + LOWERCASE + DIGITS + SYMBOLS;
  const chars: string[] = [];

  chars.push(UPPERCASE[secureRandomInt(UPPERCASE.length)]);
  chars.push(LOWERCASE[secureRandomInt(LOWERCASE.length)]);
  chars.push(DIGITS[secureRandomInt(DIGITS.length)]);
  chars.push(SYMBOLS[secureRandomInt(SYMBOLS.length)]);

  for (let i = chars.length; i < length; i++) {
    chars.push(allChars[secureRandomInt(allChars.length)]);
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

async function withProfilesReady<T>(fn: () => Promise<T>): Promise<T> {
  try {
    await ensureSeedProfiles();
  } catch {
    // Demo seed is best-effort and must not block real profile lookup or signup.
  }
  return fn();
}

export async function findUserByEmail(email: string): Promise<AppUser | undefined> {
  return withProfilesReady(() => findProfileByEmail(email));
}

export async function findUserById(id: string): Promise<AppUser | undefined> {
  return withProfilesReady(() => findProfileById(id));
}

export async function findUserBySakhiNumber(
  sakhiNumber: string
): Promise<AppUser | undefined> {
  return withProfilesReady(() => findProfileBySakhiNumber(sakhiNumber));
}

export async function createUser(data: {
  name: string;
  email: string;
  password?: string;
  passwordHash?: string;
  age?: string | null;
  city?: string | null;
  phone?: string | null;
  role?: UserRole;
}): Promise<AppUser> {
  return withProfilesReady(async () => {
    const normalizedEmail = data.email.toLowerCase().trim();

    if (await findProfileByEmail(normalizedEmail)) {
      throw new Error("A user with this email address already exists.");
    }

    let passwordHash: string | undefined | null = data.passwordHash;
    if (passwordHash === undefined && data.password) {
      const saltRounds = 10;
      passwordHash = await bcrypt.hash(data.password, saltRounds);
    }

    const explicitRole: UserRole | undefined = data.role;
    const role: UserRole =
      explicitRole || (profileIsAdminEmail(normalizedEmail) ? "ADMIN" : "USER");

    return createProfile({
      name: data.name.trim(),
      email: normalizedEmail,
      passwordHash: passwordHash ?? null,
      role,
      age: data.age ?? null,
      city: data.city ?? null,
      phone: data.phone ?? null,
    });
  });
}

export async function verifyUserPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
