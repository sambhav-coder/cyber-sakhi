import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ONETIME_COOKIE } from "@/lib/onetimeCookie";

// This route reads the request URL for the one-time token, so it must be
// rendered dynamically (Next.js 14 App Router).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const store = cookies();
    const raw = store.get(ONETIME_COOKIE)?.value;

    if (!token || !raw) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    const [storedToken, payloadB64] = raw.split(".");
    if (storedToken !== token || !payloadB64) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    let payload: {
      sakhiNumber?: string;
      generatedPassword?: string;
      name?: string;
      email?: string;
      expiresAt?: number;
    };
    try {
      payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    } catch {
      store.delete(ONETIME_COOKIE);
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 404 });
    }

    if (
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt < Date.now()
    ) {
      store.delete(ONETIME_COOKIE);
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    // Return the credentials and delete the cookie (one-time use).
    store.delete(ONETIME_COOKIE);

    return NextResponse.json({
      sakhiNumber: payload.sakhiNumber ?? "",
      generatedPassword: payload.generatedPassword ?? "",
      name: payload.name ?? "",
      email: payload.email ?? "",
    });
  } catch (error) {
    console.error("Onetime token error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve credentials" },
      { status: 500 }
    );
  }
}