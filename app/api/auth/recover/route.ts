import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { findProfileByEmail } from "@/lib/db/profiles";
import {
  createRecoveryToken,
  consumeRecoveryToken,
} from "@/lib/recoveryTokens";
import {
  isEmailConfigured,
  missingEmailConfig,
  sendRecoveryEmail,
} from "@/lib/mailer";

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

    // Production must have a real email transport. Check BEFORE the profile
    // lookup so a misconfigured deployment returns the SAME error for every
    // email address (no account-existence leak) instead of silently pretending
    // recovery instructions were sent. In development the devLink is sufficient.
    if (process.env.NODE_ENV === "production" && !isEmailConfigured()) {
      const missing = missingEmailConfig();
      return NextResponse.json(
        {
          error: `Recovery email could not be sent because the email provider is not configured. Missing environment variables: ${missing.join(", ")}.`,
        },
        { status: 503 }
      );
    }

    const profile = await findProfileByEmail(email);

    // Anti-enumeration: identical response whether or not the account exists.
    if (!profile) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    // Invalidate any prior unused tokens so only the latest link works.
    await consumeRecoveryToken(profile.id);

    const { token } = await createRecoveryToken(profile.id);
    const origin = req.nextUrl.origin;
    const recoveryLink = `${origin}/recover?token=${encodeURIComponent(token)}`;

    // Development convenience: surface the recovery link to the local UI so
    // the reset flow can be exercised without a real inbox. Production never
    // returns the link — the email is the only channel.
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        message: GENERIC_MESSAGE,
        devLink: recoveryLink,
      });
    }

    // Production: the transport is already guaranteed configured above.
    const sendResult = await sendRecoveryEmail({
      to: profile.email,
      name: profile.name,
      recoveryLink,
    });

    if (!sendResult.ok) {
      console.error("[recover] Email send failed:", sendResult.error);
      return NextResponse.json(
        { error: "The recovery email could not be delivered. Please try again later." },
        { status: 502 }
      );
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