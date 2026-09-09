import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { upsertOAuthProfile } from "./db/profiles";
import { findUserByEmail, verifyUserPassword, isAdminEmail } from "./userStore";
import {
  DEV_LOGIN_PROVIDER_ID,
  findDevPersona,
  isDevLoginEnabled,
} from "./devAuth";

/**
 * Local-only sign-in that skips Supabase entirely. Spread into the
 * providers array only when isDevLoginEnabled() is true, so it does not
 * exist at all in a production build.
 */
const devLoginProvider = CredentialsProvider({
  id: DEV_LOGIN_PROVIDER_ID,
  name: "Developer Bypass (local only)",
  credentials: {
    persona: { label: "Persona", type: "text" },
  },
  async authorize(credentials) {
    if (!isDevLoginEnabled()) {
      throw new Error("Developer bypass is disabled.");
    }
    const persona = findDevPersona(credentials?.persona || "user");
    if (!persona) throw new Error("Unknown developer persona.");

    return {
      id: persona.id,
      name: persona.name,
      email: persona.email,
      role: persona.role,
      sakhiNumber: persona.sakhiNumber,
    };
  },
});

export const authOptions: NextAuthOptions = {
  // Ensure NEXTAUTH_URL is set correctly for production
  // In production on Vercel, this should be set to the canonical domain URL
  // If not set, NextAuth will attempt to infer it from the request
  providers: [
    // 1. Google OAuth Provider
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "demo-google-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "demo-google-client-secret",
      // Allow user to select account and force consent for proper account switching
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
        },
      },
    }),

    // 2. Email + Password Credentials Provider
    CredentialsProvider({
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "you@example.com" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter both email and password.");
        }

        const user = await findUserByEmail(credentials.email);
        if (!user || !user.passwordHash) {
          throw new Error("Invalid email or password.");
        }

        const isValid = await verifyUserPassword(credentials.password, user.passwordHash);
        if (!isValid) {
          throw new Error("Invalid email or password.");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sakhiNumber: user.sakhiNumber,
        };
      },
    }),

    // 3. Local development bypass — absent entirely in production builds.
    ...(isDevLoginEnabled() ? [devLoginProvider] : []),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === "google") {
        const email = (user?.email || token.email || "").toLowerCase().trim();
        console.log("[NextAuth JWT] Google OAuth callback - email:", email);

        if (email) {
          try {
            console.log("[NextAuth JWT] Attempting profile upsert for:", email);
            const profile = await upsertOAuthProfile({
              email,
              name: user?.name || token.name || email,
              image: user?.image || null,
            });
            token.id = profile.id;
            token.role = profile.role;
            token.sakhiNumber = profile.sakhiNumber;
            console.log("[NextAuth JWT] Profile upsert successful - id:", profile.id, "role:", profile.role, "sakhi:", profile.sakhiNumber);
          } catch (error) {
            console.error("[NextAuth JWT] Failed to upsert OAuth profile:", error);
            token.role = isAdminEmail(email) ? "ADMIN" : "USER";
            token.id = token.sub || user?.id || "";
            console.log("[NextAuth JWT] Using fallback - id:", token.id, "role:", token.role);
          }
        } else {
          token.role = isAdminEmail(token.email || "") ? "ADMIN" : "USER";
          console.log("[NextAuth JWT] No email available, using fallback role:", token.role);
        }
        return token;
      }

      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sakhiNumber = (user as any).sakhiNumber;
        console.log("[NextAuth JWT] Credentials login - id:", user.id, "role:", user.role, "sakhi:", (user as any).sakhiNumber);
      }

      if (!token.role) {
        token.role = "USER";
        console.log("[NextAuth JWT] No role set, using fallback USER");
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string) || "";
        session.user.role = (token.role as "USER" | "ADMIN") || "USER";
        session.user.sakhiNumber = token.sakhiNumber as string | undefined;
        console.log("[NextAuth Session] Session created - id:", session.user.id, "role:", session.user.role, "sakhi:", session.user.sakhiNumber);
      }
      return session;
    },
    
    async redirect({ url, baseUrl }) {
      console.log("[NextAuth Redirect] Redirect callback - url:", url, "baseUrl:", baseUrl);
      // Allows relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allows callback URLs on the same origin
      else if (new URL(url).origin === baseUrl) return url;
      // Fallback to dashboard
      return `${baseUrl}/dashboard`;
    },
  },

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET || "cyber-sakhi-security-secret-key-2026-auth",
  
  // Debug: log NEXTAUTH_URL in development to help diagnose OAuth issues
  debug: process.env.NODE_ENV === "development",
};

// Log environment configuration for debugging (safe logging only)
console.log("[NextAuth Config] Environment check:", {
  hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
  hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
  hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
  nodeEnv: process.env.NODE_ENV,
});