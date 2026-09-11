import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { updateProfilePassword } from "@/lib/db/profiles";
import { generateSecurePassword } from "@/lib/userStore";
import { storeOneTimeCredentials } from "@/lib/onetimeCookie";
import {
  findProfileByRecoveryToken,
  consumeRecoveryToken,
} from "@/lib/recoveryTokens";

const PASSWORD_HASH_ROUNDS = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "");

    if (!token) {
      return NextResponse.json(
        { error: "Recovery token is required." },
        { status: 400 }
      );
    }

    const result = await findProfileByRecoveryToken(token);

    if (!result) {
      return NextResponse.json(
        { error: "This recovery link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Generate a cryptographically random, strong temporary password. Only its
    // bcrypt hash is ever persisted on the profile; the plaintext is handed to
    // the user exactly once through the existing one-time credential channel
    // (never stored in the database, never written to logs).
    const temporaryPassword = generateSecurePassword();
    const temporaryPasswordHash = await bcrypt.hash(
      temporaryPassword,
      PASSWORD_HASH_ROUNDS
    );

    await updateProfilePassword(result.profileId, temporaryPasswordHash);

    // Invalidate the token now that it has been used (single-use, short-lived).
    await consumeRecoveryToken(result.profileId);

    // Deliver the plaintext once via the same HttpOnly one-time cookie used by
    // signup. The API response carries only a redemption token, not the password.
    const oneTimeToken = storeOneTimeCredentials({
      sakhiNumber: result.profile.sakhiNumber || "SAKHI-2026-UNKNOWN",
      generatedPassword: temporaryPassword,
      name: result.profile.name,
      email: result.profile.email,
    });

    return NextResponse.json({
      message:
        "Your credentials have been recovered. Sign in with your Sakhi Number and the temporary password shown on the next screen.",
      sakhiNumber: result.profile.sakhiNumber,
      token: oneTimeToken,
    });
  } catch (error) {
    console.error("Recovery reset error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}