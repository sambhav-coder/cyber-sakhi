import { NextRequest, NextResponse } from "next/server";
import { findProfileByRecoveryToken } from "@/lib/recoveryTokens";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = String(body?.token ?? "");

    if (!token) {
      return NextResponse.json({ error: "Recovery token is required." }, { status: 400 });
    }

    const result = await findProfileByRecoveryToken(token);

    if (!result) {
      return NextResponse.json(
        { error: "This recovery link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      sakhiNumber: result.profile.sakhiNumber,
      email: result.profile.email,
    });
  } catch (error) {
    console.error("Recovery lookup error:", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}