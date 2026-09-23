import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isValidUuid } from "@/lib/db/cases";
import {
  coarseCoordinates,
  listCaseLocationsForUser,
  LocationAccessError,
  saveCaseLocation,
  validateLocationInput,
} from "@/lib/db/caseLocations";
import { logAuditEvent } from "@/lib/audit";

export const runtime = "nodejs";

function notFound() {
  // Masked: foreign and missing case IDs are indistinguishable.
  return NextResponse.json({ error: "Case not found or access denied." }, { status: 404 });
}

/** List this user's saved locations for one owned case (newest first). */
export async function GET(_req: Request, { params }: { params: { caseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isValidUuid(params.caseId)) return notFound();
  try {
    const rows = await listCaseLocationsForUser(params.caseId, session.user.id);
    void logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role ?? null,
      action: "location.viewed",
      entity: "case",
      entityId: params.caseId,
      caseId: params.caseId,
      payload: { count: rows.length },
    });
    return NextResponse.json({ locations: rows });
  } catch (error) {
    if (error instanceof LocationAccessError) return notFound();
    return NextResponse.json({ error: "Could not load locations." }, { status: 500 });
  }
}

/**
 * Save a one-time, consent-based location capture to an owned case.
 * Identity comes ONLY from the server session; caseId is ownership-checked.
 */
export async function POST(req: Request, { params }: { params: { caseId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isValidUuid(params.caseId)) return notFound();
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const b = (body || {}) as Record<string, unknown>;
  const validated = validateLocationInput({
    latitude: b.latitude,
    longitude: b.longitude,
    accuracyM: b.accuracyM,
    source: b.source,
  });
  if (!validated) {
    return NextResponse.json(
      { error: "Invalid coordinates. Latitude must be -90..90, longitude -180..180, accuracy 0..100000 m." },
      { status: 422 }
    );
  }
  const capturedAt = typeof b.capturedAt === "string" ? b.capturedAt : undefined;
  try {
    const row = await saveCaseLocation({
      caseId: params.caseId,
      userId: session.user.id,
      location: validated,
      capturedAt,
    });
    // Audit carries only coarse (~1 km) coordinates — never precise ones.
    void logAuditEvent({
      actorId: session.user.id,
      actorRole: session.user.role ?? null,
      action: "location.shared",
      entity: "case",
      entityId: params.caseId,
      caseId: params.caseId,
      payload: {
        approx: coarseCoordinates(validated.latitude, validated.longitude),
        accuracyM: validated.accuracyM,
        source: validated.source,
      },
    });
    return NextResponse.json({ location: row }, { status: 201 });
  } catch (error) {
    if (error instanceof LocationAccessError) return notFound();
    return NextResponse.json({ error: "Could not save location." }, { status: 500 });
  }
}
