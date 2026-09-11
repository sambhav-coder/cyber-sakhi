import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { findProfileByEmail } from "@/lib/db/profiles";
import {
  createRecoveryToken,
  consumeRecoveryToken,
  generateRecoveryToken,
  RECOVERY_TOKEN_TTL_MS,
} from "@/lib/recoveryTokens";

const GENERIC_MESSAGE =
  "A recovery link has been generated below. It expires in 15 minutes and can only be used once.";

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

    const origin = req.nextUrl.origin;
    const profile = await findProfileByEmail(email);

    // Anti-enumeration: identical response whether or not the account exists.
    // Unknown emails receive a decoy link whose token was never persisted, so
    // a requester cannot distinguish existing from non-existing accounts.
    if (!profile) {
      const decoyToken = generateRecoveryToken();
      return NextResponse.json({
        message: GENERIC_MESSAGE,
        recoveryLink: `${origin}/recover?token=${encodeURIComponent(decoyToken)}`,
        expiresAt: new Date(Date.now() + RECOVERY_TOKEN_TTL_MS).toISOString(),
      });
    }

    // Invalidate any prior unused tokens so only the latest link works.
    await consumeRecoveryToken(profile.id);

    const { token, expiresAt } = await createRecoveryToken(profile.id);
    const recoveryLink = `${origin}/recover?token=${encodeURIComponent(token)}`;

    return NextResponse.json({ message: GENERIC_MESSAGE, recoveryLink, expiresAt });
  } catch (error) {
    console.error("Recovery request error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}