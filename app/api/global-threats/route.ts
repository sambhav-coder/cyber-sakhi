import { NextResponse } from "next/server";
import { buildSnapshot } from "@/lib/globalThreatData";

/* ------------------------------------------------------------------ *
 * GET /api/global-threats
 *
 * The single seam between the map UI and its data source. Today it
 * returns the modelled snapshot described in lib/globalThreatData.ts.
 * To go live, swap buildSnapshot() for a real query — the response
 * shape (GlobalSnapshot) is what the UI contracts against, so no
 * component needs to change.
 * ------------------------------------------------------------------ */

// Recomputed per request so generatedAt reflects the actual fetch.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = buildSnapshot();
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Global threat snapshot unavailable.", details: String(error) },
      { status: 500 }
    );
  }
}
