import { NextResponse } from "next/server";

// The previous temporary diagnostics endpoint disclosed credential fingerprints
// and deployment topology without authentication. Keep the path unavailable so
// old bookmarks do not turn into a production information-disclosure endpoint.
export async function GET() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}
