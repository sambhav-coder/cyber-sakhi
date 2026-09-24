/**
 * Government password policy (centralized, backend-enforced).
 *
 * Practical and secure: minimum length plus character-class breadth plus a
 * small denylist of guessable choices. No periodic rotation is forced
 * (rotation is event-driven: reset, suspected compromise, admin action).
 * Frontend checks are UX only; every password-setting path (seed, reset,
 * admin issue) must call `evaluateGovPassword`.
 */

export const GOV_PASSWORD_MIN_LENGTH = 12;
export const GOV_PASSWORD_MAX_LENGTH = 256;

const DENIED_SUBSTRINGS = [
  "password",
  "cybersakhi",
  "cyber-sakhi",
  "cyber",
  "sakhi",
  "govind",
  "admin",
  "officer",
  "qwerty",
  "letmein",
  "welcome",
];

export interface GovPasswordEvaluation {
  ok: boolean;
  reasons: string[];
}

/**
 * Evaluate a candidate password. Pure so policy is unit-testable and
 * identical everywhere it is enforced. Never log the candidate.
 */
export function evaluateGovPassword(password: string): GovPasswordEvaluation {
  const reasons: string[] = [];
  if (password.length < GOV_PASSWORD_MIN_LENGTH) {
    reasons.push(`Use at least ${GOV_PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > GOV_PASSWORD_MAX_LENGTH) {
    reasons.push(`Keep the password under ${GOV_PASSWORD_MAX_LENGTH} characters.`);
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    reasons.push("Include at least three of: lowercase, uppercase, digits, symbols.");
  }
  const lowered = password.toLowerCase();
  if (DENIED_SUBSTRINGS.some((word) => lowered.includes(word))) {
    reasons.push("Avoid common words and product names in the password.");
  }
  if (/^(.)\1+$/.test(password)) {
    reasons.push("Avoid repeating a single character.");
  }
  return { ok: reasons.length === 0, reasons };
}
