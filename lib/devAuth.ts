import { UserRole } from "./authTypes";

/* ------------------------------------------------------------------ *
 * Development login bypass
 *
 * Lets you reach an authenticated session without Supabase credentials,
 * which is what real sign-in now depends on.
 *
 * SAFETY: this is double-gated. It requires BOTH a non-production build
 * AND an explicit opt-in env flag. A production build can never enable
 * it, even if ALLOW_DEV_LOGIN is somehow set in the environment, because
 * NODE_ENV is fixed to "production" by `next build`.
 *
 * Never set ALLOW_DEV_LOGIN in a deployed environment.
 * ------------------------------------------------------------------ */

export const DEV_LOGIN_PROVIDER_ID = "dev-bypass";

export function isDevLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_DEV_LOGIN === "true"
  );
}

export interface DevPersona {
  key: string;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  sakhiNumber: string;
  blurb: string;
}

export const DEV_PERSONAS: DevPersona[] = [
  {
    key: "user",
    id: "dev_user_bypass",
    name: "Ananya Sharma",
    email: "user@cybersakhi.org",
    role: "USER",
    sakhiNumber: "SAKHI-2026-DEV01",
    blurb: "Standard survivor account. Sees the dashboard, vault and SOS.",
  },
  {
    key: "admin",
    id: "dev_admin_bypass",
    name: "Cyber Sakhi Safety Admin",
    email: "admin@cybersakhi.org",
    role: "ADMIN",
    sakhiNumber: "SAKHI-2026-DEV02",
    blurb: "Adds the institutional Admin Portal and case ledger.",
  },
];

export function findDevPersona(key: string): DevPersona | undefined {
  return DEV_PERSONAS.find((p) => p.key === key);
}
