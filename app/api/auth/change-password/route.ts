import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import bcrypt from "bcryptjs";
import { findUserById, verifyUserPassword } from "@/lib/userStore";
import { updateProfilePassword } from "@/lib/db/profiles";
import { validatePasswordStrength } from "@/lib/passwordPolicy";

const GENERIC_ERROR = "Failed to change password. Please try again.";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "Current password and new password are required." }, { status: 400 });
    }

    // Validate new password strength
    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return NextResponse.json({ error: strengthCheck.error }, { status: 400 });
    }

    // Check if new password is same as current
    if (currentPassword === newPassword) {
      return NextResponse.json({ error: "New password must be different from current password." }, { status: 400 });
    }

    // Get user and verify current password
    const user = await findUserById(session.user.id);
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: GENERIC_ERROR }, { status: 400 });
    }

    const isCurrentPasswordValid = await verifyUserPassword(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    // Hash new password and update
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await updateProfilePassword(session.user.id, newPasswordHash);

    return NextResponse.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: GENERIC_ERROR },
      { status: 500 }
    );
  }
}
