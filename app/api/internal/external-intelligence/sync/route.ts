import { NextResponse } from "next/server";
import { syncUrlhaus } from "@/lib/gov/govExternalIntel";

export const runtime = "nodejs";

/** Scheduler-only route. It accepts no source or credential from the caller. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  try { return NextResponse.json({ source: "URLhaus", ...(await syncUrlhaus(null)) }); }
  catch { return NextResponse.json({ error: "External-intelligence synchronization failed." }, { status: 503 }); }
}
