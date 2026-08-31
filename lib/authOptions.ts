import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { findUserByEmail, verifyUserPassword, isAdminEmail } from "./userStore";

export const authOptions: NextAuthOptions = {
  providers: [
    // 1. Google OAuth Provider
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "demo-google-client-id",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "demo-google-client-secret",
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

        const user = findUserByEmail(credentials.email);
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
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }

      // If user logged in via OAuth (e.g. Google), evaluate role from trusted admin whitelist
      if (account && account.provider === "google") {
        const userEmail = token.email || "";
        token.role = isAdminEmail(userEmail) ? "ADMIN" : "USER";
      }

      // Ensure fallback role
      if (!token.role) {
        token.role = "USER";
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) || (token.sub as string) || "";
        session.user.role = (token.role as "USER" | "ADMIN") || "USER";
      }
      return session;
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
};