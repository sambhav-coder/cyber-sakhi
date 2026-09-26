// Single source of truth for the NextAuth JWT secret.
// The same secret must be used by the Node.js API runtime
// and the Edge runtime (middleware).

const secret =
  process.env.NEXTAUTH_SECRET ||
  (process.env.NODE_ENV === "development"
    ? "development-nextauth-secret-key-cyber-sakhi"
    : "cyber-sakhi-production-fallback-secret-2026");

if (!process.env.NEXTAUTH_SECRET && process.env.NODE_ENV === "production") {
  console.warn(
    "[NextAuth Config] WARNING: NEXTAUTH_SECRET environment variable is not set. " +
    "Set NEXTAUTH_SECRET in production environment variables."
  );
}

export const AUTH_SECRET: string = secret;
