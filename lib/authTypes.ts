export type UserRole = "USER" | "ADMIN";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  sakhiNumber?: string;
  age?: string | null;
  city?: string | null;
  phone?: string | null;
  createdAt: string;
}