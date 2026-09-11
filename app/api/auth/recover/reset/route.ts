import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { updateProfilePassword } from "@/lib/db/profiles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
import {
  findProfileByRecoveryToken,
  consumeRecoveryToken,
} from "@/lib/recoveryTokens";

const PASSWORD_HASH_ROUNDS = 10;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "");
    const newPassword = String(body?.newPassword ?? "");

    if (!token || !newPassword) {
      return NextResponse.json(
        { error: "Recovery token and new password are required." },
        { status: 400 }
      );
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return NextResponse.json({ error: strengthCheck.error }, { status: 400 });
    }

    const result = await findProfileByRecoveryToken(token);

    if (!result) {
      return NextResponse.json(
        { error: "This recovery link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    // Hash the new password and persist it against the SAME profile record.
    // No second user/profile is ever created during recovery.
    const newPasswordHash = await bcrypt.hash(newPassword, PASSWORD_HASH_ROUNDS);
    await updateProfilePassword(result.profileId, newPasswordHash);

    // Invalidate the token now that it has been used (single-use, short-lived).
    await consumeRecoveryToken(result.profileId);

    return NextResponse.json({
      message:
        "Your credentials have been recovered. You can now sign in using your Sakhi Number and new password.",
      sakhiNumber: result.profile.sakhiNumber,
    });
  } catch (error) {
    console.error("Recovery reset error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}