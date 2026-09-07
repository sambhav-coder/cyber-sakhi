import bcrypt from "bcryptjs";
import { AppUser, UserRole } from "./authTypes";
import {
  createProfile,
  ensureSeedProfiles,
  findProfileByEmail,
  findProfileById,
  isAdminEmail as profileIsAdminEmail,
} from "./db/profiles";

export { isAdminEmail } from "./db/profiles";

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

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
}): Promise<AppUser> {
  return withProfilesReady(async () => {
    const normalizedEmail = data.email.toLowerCase().trim();

    if (await findProfileByEmail(normalizedEmail)) {
      throw new Error("A user with this email address already exists.");
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(data.password, saltRounds);

    // Security Rule: Public signup is strictly assigned role "USER" unless explicitly whitelisted in ADMIN_EMAILS
    const role: UserRole = profileIsAdminEmail(normalizedEmail) ? "ADMIN" : "USER";

    return createProfile({
      name: data.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role,
    });
  });
}

export async function verifyUserPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
