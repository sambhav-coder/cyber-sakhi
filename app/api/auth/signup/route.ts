import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createUser, findUserByEmail, generateSecurePassword } from "@/lib/userStore";
import { storeOneTimeCredentials } from "@/lib/onetimeCookie";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+\d][\d\s()\-]{7,}$/;

export async function POST(req: NextRequest) {
  try {
    // Security: an already-authenticated user must NOT be able to create a
    // second profile from here (this would allow session/identity ambiguity).
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      return NextResponse.json(
        {
          error:
            "You are already logged in. Please sign out before creating a new account.",
        },
        { status: 409 }
      );
    }

    const body = await req.json();
    const { name, email, age, city, phone } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Name is required." }, { status: 400 });
    }

    if (
      !email ||
      typeof email !== "string" ||
      !EMAIL_REGEX.test(email.trim())
    ) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const ageStr = String(age ?? "").trim();
    const ageNum = Number(ageStr);
    if (!ageStr || Number.isNaN(ageNum) || ageNum < 10 || ageNum > 120) {
      return NextResponse.json(
        { error: "Age must be a valid number between 10 and 120." },
        { status: 400 }
      );
    }

    // City and phone are OPTIONAL private details, never mandatory.
    const cityStr = typeof city === "string" ? city.trim() : "";

    const phoneStr = String(phone ?? "").trim();
    if (phoneStr && !PHONE_REGEX.test(phoneStr)) {
      return NextResponse.json(
        { error: "A valid phone number is required (e.g. +91 98XXX XXXXX)." },
        { status: 400 }
      );
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: "An account with this email address already exists. Please log in." },
        { status: 409 }
      );
    }

    const generatedPassword = generateSecurePassword();
    const passwordHash = await bcrypt.hash(generatedPassword, 10);

    const newUser = await createUser({
      name: name.trim(),
      email: email.trim(),
      passwordHash,
      age: ageStr,
      city: cityStr || null,
      phone: phoneStr || null,
    });

    // Store credentials in the one-time store keyed by a random token. The
    // plaintext password is never persisted in the database or included in
    // logs / URLs — it is only retrievable once via /api/auth/onetime via a
    // short-lived HttpOnly cookie.
    const token = storeOneTimeCredentials({
      sakhiNumber: newUser.sakhiNumber || "SAKHI-2026-UNKNOWN",
      generatedPassword,
      name: newUser.name,
      email: newUser.email,
    });

    return NextResponse.json(
      {
        message: "Account created successfully.",
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          sakhi_number: newUser.sakhiNumber || null,
          age: newUser.age ?? null,
          city: newUser.city ?? null,
          phone: newUser.phone ?? null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create account.";
    if (/already exists/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}