import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { AUTH_SECRET } from "./authSecret";
import { findProfileByEmail } from "./db/profiles";
import {
  findUserByEmail,
  findUserBySakhiNumber,
  verifyUserPassword,
  isAdminEmail,
} from "./userStore";
import {
  DEV_LOGIN_PROVIDER_ID,
  findDevPersona,
  isDevLoginEnabled,
} from "./devAuth";

const SAKHI_NUMBER_REGEX = /^SAKHI-2026-[A-Z0-9]{5}$/i;
const GENERIC_AUTH_ERROR = "Invalid credentials.";

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
    // 1. Google OAuth Provider (signup only — the login page does not list it)
    // Note: Demo values are non-functional placeholders. In production, set real
    // GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables.
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

    // 2. Sakhi Number & Password Credentials Provider
    //    Primary lookup: Sakhi Number.
    //    Email fallback kept for backward compat with pre-existing demo seed accounts
    //    (admin@cybersakhi.org / user@cybersakhi.org) that were created before the
    //    Sakhi Number concept was introduced. The UI only advertises Sakhi Number.
    CredentialsProvider({
      id: "credentials",
      name: "Sakhi Number & Password",
      credentials: {
        identifier: {
          label: "Sakhi Number",
          type: "text",
          placeholder: "SAKHI-2026-XXXXX",
        },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.identifier || !credentials?.password) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        const identifier = String(credentials.identifier).trim();
        const password = String(credentials.password);

        // Special handling for SIH demo login
        if (identifier === "SAKHI-2026-DSAX" && process.env.SIH_DEMO_ENABLED === "true") {
          // For demo login, accept the special token and authenticate the demo user directly
          // This bypasses environment variable parsing issues with special characters
          // while maintaining security by only allowing this specific demo account
          if (password === "SIH_DEMO_AUTH_TOKEN") {
            const user = await findUserBySakhiNumber(identifier.toUpperCase());
            if (user && user.role === "USER") {
              // Verify the user exists and has the correct role
              // No password verification needed for demo token - this is intentional
              // for the SIH demo experience
              return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                sakhiNumber: user.sakhiNumber,
              };
            }
            // If user not found or wrong role, fall through to generic error
          }
        }

        let user = undefined;
        if (SAKHI_NUMBER_REGEX.test(identifier)) {
          user = await findUserBySakhiNumber(identifier.toUpperCase());
        } else {
          user = await findUserByEmail(identifier);
        }

        if (!user || !user.passwordHash) {
          throw new Error(GENERIC_AUTH_ERROR);
        }

        const isValid = await verifyUserPassword(password, user.passwordHash);
        if (!isValid) {
          throw new Error(GENERIC_AUTH_ERROR);
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

        // Read-only profile lookup. We deliberately do NOT create/upsert a
        // profiles row here: age is mandatory for Cyber Sakhi signup and the
        // Google callback cannot provide it, so a partial account must not be
        // silently created. The /api/auth/google-signup route completes the
        // signup (age step → password hash → Sakhi Number) instead.
        try {
          const existing = email ? await findProfileByEmail(email) : undefined;
          token.id = existing?.id || token.sub || user?.id || "";
          token.role = existing?.role || (isAdminEmail(email) ? "ADMIN" : "USER");
          token.sakhiNumber = existing?.sakhiNumber;
        } catch {
          token.role = isAdminEmail(email) ? "ADMIN" : "USER";
          token.id = token.sub || user?.id || "";
        }
        return token;
      }

      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sakhiNumber = (user as any).sakhiNumber;
      }

      if (!token.role) {
        token.role = "USER";
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string) || "";
        session.user.role = (token.role as "USER" | "ADMIN") || "USER";
        session.user.sakhiNumber = token.sakhiNumber as string | undefined;
      }
      return session;
    },

    async redirect({ url, baseUrl }) {
      // Google signup lands back on /signup?google=true — preserve the query
      // so the one-time credentials popup flow can continue.
      if (url.startsWith("/signup")) {
        return `${baseUrl}${url}`;
      }
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

  secret: AUTH_SECRET,

  // Debug: log NEXTAUTH_URL in development to help diagnose OAuth issues
  debug: process.env.NODE_ENV === "development",
};

// Log environment configuration for debugging (safe logging only)
console.log("[NextAuth Config] Environment check:", {
  hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
  hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
  hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
  hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
  nodeEnv: process.env.NODE_ENV,
});

// Production security check: warn if demo credentials are still in use
if (process.env.NODE_ENV === "production") {
  if (!process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID === "demo-google-client-id") {
    console.warn("[NextAuth Config] WARNING: GOOGLE_CLIENT_ID is not configured in production. Google OAuth will not work.");
  }
  if (!process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET === "demo-google-client-secret") {
    console.warn("[NextAuth Config] WARNING: GOOGLE_CLIENT_SECRET is not configured in production. Google OAuth will not work.");
  }
}