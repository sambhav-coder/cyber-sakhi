import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { findProfileByEmail } from "@/lib/db/profiles";
import {
  createRecoveryToken,
  consumeRecoveryToken,
} from "@/lib/recoveryTokens";

const GENERIC_MESSAGE =
  "If an account exists for this email, recovery instructions have been sent.";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  try {
    // Security: a logged-in user does not need account recovery. Requesting
    // a reset link while signed in risks resetting someone else's password,
    // so it is explicitly blocked with a clear message.
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      return NextResponse.json(
        {
          error:
            "You are already logged in. You can change your password from the Change Password screen instead.",
        },
        { status: 409 }
      );
    }

    let email = "";
    try {
      const body = await req.json();
      email = String(body?.email ?? "").toLowerCase().trim();
    } catch {
      return NextResponse.json({ error: "Email is required." }, { status: 400 });
    }

    if (!email || !EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    const profile = await findProfileByEmail(email);

    // Generic response regardless of whether the account exists (anti-enumeration).
    if (!profile) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    // Invalidate any prior unused tokens so only the latest link works.
    await consumeRecoveryToken(profile.id);

    const { token } = await createRecoveryToken(profile.id);
    const origin = req.nextUrl.origin;
    const recoveryLink = `${origin}/recover?token=${encodeURIComponent(token)}`;

    // Email delivery is not configured (no SMTP / Resend / SendGrid env vars),
    // so in a development build we surface the recovery link to the local UI.
    // In production the link is never returned to the client — only the
    // generic message above — so a configured email sender can deliver it.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        message: GENERIC_MESSAGE,
        devLink: recoveryLink,
      });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    console.error("Recovery request error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}