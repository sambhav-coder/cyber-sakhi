// Single source of truth for the NextAuth JWT secret so the Node.js API
// runtime (next-auth API routes) and the Edge runtime (middleware withAuth)
// ALWAYS resolve the identical value. A drift here is the classic cause of
// "login succeeds but protected pages bounce back to /login": the Node side
// signs the JWT with one secret and the edge middleware fails to decode it.
//
// Production must set NEXTAUTH_SECRET (Vercel env). The fallback is only a
// safety net for local development; it must never be relied on in production.
export const AUTH_SECRET: string =
  process.env.NEXTAUTH_SECRET || "cyber-sakhi-security-secret-key-2026-auth";