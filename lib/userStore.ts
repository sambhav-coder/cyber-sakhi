import bcrypt from "bcryptjs";
import { AppUser, UserRole } from "./authTypes";

// Initial seeded accounts
const SEED_USERS: AppUser[] = [
  {
    id: "usr_admin_seed",
    name: "Cyber Sakhi Safety Admin",
    email: "admin@cybersakhi.org",
    passwordHash: bcrypt.hashSync("Admin@Sakhi2026!", 10),
    role: "ADMIN",
    createdAt: new Date("2026-08-01").toISOString(),
  },
  {
    id: "usr_demo_user",
    name: "Ananya Sharma",
    email: "user@cybersakhi.org",
    passwordHash: bcrypt.hashSync("User@Sakhi2026!", 10),
    role: "USER",
    createdAt: new Date("2026-08-15").toISOString(),
  },
];

// In-memory store (persisted in global scope in Node during process lifetime)
declare global {
  // eslint-disable-next-line no-var
  var __CYBER_SAKHI_USERS__: AppUser[] | undefined;
}

function getUsersStore(): AppUser[] {
  if (!global.__CYBER_SAKHI_USERS__) {
    global.__CYBER_SAKHI_USERS__ = [...SEED_USERS];
  }
  return global.__CYBER_SAKHI_USERS__;
}

export function isAdminEmail(email: string): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  const envAdmins = (process.env.ADMIN_EMAILS || "")
    .toLowerCase()
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (envAdmins.includes(normalized)) return true;
  if (normalized === "admin@cybersakhi.org") return true;
  return false;
}

export function findUserByEmail(email: string): AppUser | undefined {
  const store = getUsersStore();
  return store.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
}

export function findUserById(id: string): AppUser | undefined {
  const store = getUsersStore();
  return store.find((u) => u.id === id);
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
}): Promise<AppUser> {
  const store = getUsersStore();
  const normalizedEmail = data.email.toLowerCase().trim();

  if (findUserByEmail(normalizedEmail)) {
    throw new Error("A user with this email address already exists.");
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(data.password, saltRounds);

  // Security Rule: Public signup is strictly assigned role "USER" unless explicitly whitelisted in ADMIN_EMAILS
  const role: UserRole = isAdminEmail(normalizedEmail) ? "ADMIN" : "USER";

  const newUser: AppUser = {
    id: "usr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
    name: data.name.trim(),
    email: normalizedEmail,
    passwordHash,
    role,
    createdAt: new Date().toISOString(),
  };

  store.push(newUser);
  return newUser;
}

export async function verifyUserPassword(
  plainPassword: string,
  passwordHash: string
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}