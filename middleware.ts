import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { AUTH_SECRET } from "@/lib/authSecret";

// Every app shell / feature page is protected. Middleware is the source of
// truth: unauthenticated users are redirected to /login (with a callbackUrl
// back to the page they requested once they authenticate).
//
// NOTE: /gov routes use a separate government authentication system
// (GovAuth with its own session cookies) and are NOT protected by this
// NextAuth middleware. Government routes have their own auth guards
// in the government-specific pages and API routes.
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/locker",
  "/email-forensics",
  "/detector",
  "/companion",
  "/sakhi",
  "/contacts",
  "/sos",
  "/admin",
  "/developer",
  "/cases",
];

// API routes that require authentication
//
// NOTE: /api/gov routes use a separate government authentication system
// (GovAuth with its own session cookies) and are NOT protected by this
// NextAuth middleware. Government APIs have their own auth guards.
const PROTECTED_API_PREFIXES = [
  "/api/voice",
  "/api/email-forensics",
  "/api/cases",
  "/api/evidence",
  "/api/chat",
  "/api/anchor",
  "/api/offender-network",
  "/api/admin",
  "/api/admin/retention",
  "/api/alerts",
  "/api/blockchain",
  "/api/chain-of-custody",
];

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const isAuth = !!token;
    const isAdmin = token?.role === "ADMIN";
    const pathname = req.nextUrl.pathname;
    const isAdminRoute = pathname.startsWith("/admin");
    const isDeveloperRoute = pathname.startsWith("/developer");

    if (isAdminRoute && isAuth && !isAdmin) {
      // Allow request to proceed to /admin where the 403 Access Denied screen renders
      return NextResponse.next();
    }

    if (isDeveloperRoute && isAuth && !isAdmin) {
      // Non-admin users trying to access /developer get redirected to dashboard
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  },
  {
    secret: AUTH_SECRET,
    callbacks: {
      authorized: ({ token, req }) => {
        // Every protected route requires active authentication. withAuth
        // redirects unauthenticated users to /login, preserving the
        // requested path as ?callbackUrl= so they land back where they were.
        if (
          PROTECTED_PREFIXES.some((prefix) =>
            req.nextUrl.pathname.startsWith(prefix)
          )
        ) {
          return !!token;
        }

        // API routes require authentication - return 401 for API calls
        if (
          PROTECTED_API_PREFIXES.some((prefix) =>
            req.nextUrl.pathname.startsWith(prefix)
          )
        ) {
          return !!token;
        }

        return true;
      },
    },
    pages: {
      signIn: "/login",
    },
    cookies: {
      sessionToken: {
        name:
          process.env.NEXTAUTH_URL?.startsWith("https://") ||
          !!process.env.VERCEL_URL
            ? "__Secure-next-auth.session-token"
            : "next-auth.session-token",
      },
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/locker/:path*",
    "/email-forensics/:path*",
    "/detector/:path*",
    "/companion/:path*",
    "/sakhi/:path*",
    "/contacts/:path*",
    "/sos/:path*",
    "/admin/:path*",
    "/developer/:path*",
    "/cases/:path*",
    "/api/voice/:path*",
    "/api/email-forensics/:path*",
    "/api/cases/:path*",
    "/api/evidence/:path*",
    "/api/chat/:path*",
    "/api/anchor/:path*",
    "/api/offender-network/:path*",
    "/api/admin/:path*",
    "/api/alerts/:path*",
    "/api/blockchain/:path*",
    "/api/chain-of-custody/:path*",
  ],
};