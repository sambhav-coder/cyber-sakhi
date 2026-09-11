import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import bcrypt from "bcryptjs";
import {
  createUser,
  findUserByEmail,
  generateSecurePassword,
} from "@/lib/userStore";
import { updateProfileDetails } from "@/lib/db/profiles";
import { storeOneTimeCredentials } from "@/lib/onetimeCookie";

const PHONE_REGEX = /^[+\d][\d\s()\-]{7,}$/;

/**
 * NextAuth v4 stores the JWT session in one of these cookies depending on
 * whether secure cookies are enabled (NEXTAUTH_URL on https). Expiring both
 * names at path "/" guarantees the session is destroyed on every failure
 * path, so a failed Google signup never leaves a stale authenticated user.
 */
const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

function expireSessionCookies(res: NextResponse): NextResponse {
  for (const name of SESSION_COOKIE_NAMES) {
    res.cookies.set(name, "", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: name.startsWith("__Secure-"),
      maxAge: 0,
      expires: new Date(0),
    });
  }
  return res;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
      // No active session – normal unauthenticated signup flow.
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const email = session.user.email.toLowerCase().trim();

    let body: { age?: string; city?: string; phone?: string } = {};
    try {
      body = await req.json();
    } catch {
      /* no body → discovery call (returns needsAge or redirectTo) */
    }

    const ageStr = String(body.age ?? "").trim();
    const providingAge = ageStr.length > 0;

    const existingUser = await findUserByEmail(email);

    // Discovery call (no age yet): figure out what the oauth user needs.
    if (!providingAge) {
      if (existingUser?.passwordHash) {
        // Returning user — their existing profile is already attached to the
        // OAuth session by the jwt callback, so they are legitimately signed
        // in. Send them to the dashboard; the session must stay intact.
        return NextResponse.json({
          message: "Account already exists",
          redirectTo: "/dashboard",
        });
      }
      // New user (or a legacy incomplete OAuth profile): age is mandatory.
      // Keep the OAuth session so the following age-step call can complete.
      return NextResponse.json({
        needsAge: true,
        name: session.user.name || email.split("@")[0],
        email,
      });
    }

    // Age step submitted — validate before touching the database.
    const ageNum = Number(ageStr);
    if (Number.isNaN(ageNum) || ageNum < 10 || ageNum > 120) {
      // Age invalid — return a controlled error and destroy the OAuth session
      // so a failed signup never leaves a stale authenticated user.
      return expireSessionCookies(
        NextResponse.json(
          { error: "Age must be a valid number between 10 and 120." },
          { status: 400 }
        )
      );
    }

    const cityStr = typeof body.city === "string" ? body.city.trim() : "";
    const phoneStr = String(body.phone ?? "").trim();
    if (phoneStr && !PHONE_REGEX.test(phoneStr)) {
      // Phone invalid — destroy the OAuth session like any other failure.
      return expireSessionCookies(
        NextResponse.json(
          { error: "A valid phone number is required." },
          { status: 400 }
        )
      );
    }

    const generatedPassword = generateSecurePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    let newUser;
    if (existingUser) {
      if (existingUser.passwordHash) {
        return NextResponse.json({ redirectTo: "/dashboard" });
      }
      // Legacy incomplete OAuth profile: fill in the missing details.
      newUser = await updateProfileDetails(existingUser.id, {
        full_name: session.user.name || existingUser.name,
        age: ageStr,
        city: cityStr || null,
        phone: phoneStr || null,
        passwordHash,
      });
    } else {
      newUser = await createUser({
        name: session.user.name || email.split("@")[0],
        email,
        passwordHash,
        age: ageStr,
        city: cityStr || null,
        phone: phoneStr || null,
        role: undefined,
      });
    }

    // One-time token for displaying the credentials exactly once.
    const token = storeOneTimeCredentials({
      sakhiNumber: newUser.sakhiNumber || "SAKHI-2026-UNKNOWN",
      generatedPassword,
      name: newUser.name,
      email: newUser.email,
    });

    return NextResponse.json({
      message: "Account created successfully",
      token,
      sakhiNumber: newUser.sakhiNumber,
      name: newUser.name,
      email: newUser.email,
    });
  } catch (error) {
    console.error(
      "Google signup error:",
      error instanceof Error ? error.message : "Unknown error"
    );
    // Unexpected failure — destroy the OAuth session so the user can retry
    // signup from a clean, unauthenticated state.
    return expireSessionCookies(
      NextResponse.json(
        { error: error instanceof Error ? error.message : "Failed to create account" },
        { status: 500 }
      )
    );
  }
}