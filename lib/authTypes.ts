export type UserRole = "USER" | "ADMIN";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  passwordHash?: string;
  role: UserRole;
  image?: string;
  sakhiNumber?: string;
  createdAt: string;
}