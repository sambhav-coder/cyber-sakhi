/**
 * SIH Demo Mode Detection
 * 
 * Server-side utility to detect when the current session is the SIH Demo account.
 * This ensures demo mode can only be activated for the authorized demo user.
 */

const DEMO_SAKHI_NUMBER = "SAKHI-2026-DSAX";
const DEMO_JUDGE_EMAIL = "dhairya.sharma.01315616124@adgips.ac.in";

export interface DemoSession {
  isDemo: boolean;
  sakhiNumber?: string;
  email?: string;
}

/**
 * Check if the current session is the SIH Demo account.
 * This is a server-side check using the authenticated session data.
 */
export function isDemoSession(session: {
  user?: {
    id?: string | null;
    email?: string | null;
    sakhiNumber?: string | null;
    role?: string | null;
  } | null;
}): DemoSession {
  if (!session?.user) {
    return { isDemo: false };
  }

  const { sakhiNumber, email, role } = session.user;

  // Verify this is the demo account by Sakhi Number and email
  const isDemoAccount = 
    sakhiNumber === DEMO_SAKHI_NUMBER && 
    email?.toLowerCase() === DEMO_JUDGE_EMAIL.toLowerCase() &&
    role === "USER";

  return {
    isDemo: isDemoAccount,
    sakhiNumber: isDemoAccount ? sakhiNumber : undefined,
    email: isDemoAccount ? email : undefined,
  };
}

/**
 * Check if demo mode is enabled via environment variable.
 * This provides an additional server-side control.
 */
export function isDemoModeEnabled(): boolean {
  return process.env.SIH_DEMO_ENABLED === "true";
}

/**
 * Combined check: both demo mode must be enabled AND current session must be demo account.
 */
export function canUseDemoMode(session: {
  user?: {
    id?: string | null;
    email?: string | null;
    sakhiNumber?: string | null;
    role?: string | null;
  } | null;
}): boolean {
  return isDemoModeEnabled() && isDemoSession(session).isDemo;
}