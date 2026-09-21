// Single source of truth for the NextAuth JWT secret.
// The same secret must be used by the Node.js API runtime
// and the Edge runtime (middleware).

const secret = process.env.NEXTAUTH_SECRET;

if (!secret || secret.trim().length === 0) {
  throw new Error(
    "NEXTAUTH_SECRET environment variable is required. " +
    "Set it in your local .env.local or deployment environment."
  );
}

export const AUTH_SECRET: string = secret;
