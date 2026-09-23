import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import { getCaseForUser } from "@/lib/db/cases";

/**
 * Case-scoped live-location persistence.
 *
 * Authorization model (mirrors lib/db/cases.ts):
 *  - User paths ALWAYS go through getCaseForUser(caseId, userId): a caller
 *    can only write/read locations for cases they own. Unknown or foreign
 *    case IDs behave identically (null) so IDs cannot be probed.
 *  - Government reads use listCaseLocationsForGov WITHOUT an owner check —
 *    the gov API route enforces scope (requireScopedCase) + permission
 *    (case.view_pii) + purpose + mandatory audit instead.
 *  - No client-supplied userId is ever trusted: userId always comes from
 *    the server session in the API route.
 */

export interface CaseLocationRow {
  id: string;
  case_id: string;
  actor_id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  source: "gps" | "manual";
  captured_at: string;
  created_at: string;
}

export interface LocationInput {
  latitude: unknown;
  longitude: unknown;
  accuracyM?: unknown;
  source?: unknown;
}

export interface ValidatedLocation {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  source: "gps" | "manual";
}

/** Pure validation: rejects NaN/Infinity/out-of-range/non-numeric input. */
export function validateLocationInput(input: LocationInput): ValidatedLocation | null {
  const lat = typeof input.latitude === "string" ? Number(input.latitude) : input.latitude;
  const lng = typeof input.longitude === "string" ? Number(input.longitude) : input.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  let accuracyM: number | null = null;
  if (input.accuracyM !== undefined && input.accuracyM !== null) {
    const acc = typeof input.accuracyM === "string" ? Number(input.accuracyM) : input.accuracyM;
    if (typeof acc !== "number" || !Number.isFinite(acc)) return null;
    if (acc < 0 || acc > 100000) return null;
    accuracyM = Math.round(acc * 100) / 100;
  }
  const source = input.source === "manual" ? "manual" : "gps";
  return {
    latitude: Math.round(lat * 1e7) / 1e7,
    longitude: Math.round(lng * 1e7) / 1e7,
    accuracyM,
    source,
  };
}

/** Coordinates rounded to ~1.1 km: safe for audit payloads, never precise. */
export function coarseCoordinates(latitude: number, longitude: number): string {
  return `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
}

export class LocationAccessError extends Error {
  code: "not_found";
  constructor() {
    super("Case not found or access denied.");
    this.name = "LocationAccessError";
    this.code = "not_found";
  }
}

export async function saveCaseLocation(input: {
  caseId: string;
  userId: string;
  location: ValidatedLocation;
  capturedAt?: string;
}): Promise<CaseLocationRow> {
  const owns = await getCaseForUser(input.caseId, input.userId);
  if (!owns) throw new LocationAccessError();
  const capturedAt =
    input.capturedAt && !Number.isNaN(new Date(input.capturedAt).getTime())
      ? new Date(input.capturedAt).toISOString()
      : new Date().toISOString();
  const { data, error } = await getSupabaseServer()
    .from("case_locations")
    .insert({
      case_id: input.caseId,
      actor_id: input.userId,
      latitude: input.location.latitude,
      longitude: input.location.longitude,
      accuracy_m: input.location.accuracyM,
      source: input.location.source,
      captured_at: capturedAt,
    })
    .select("*")
    .single();
  throwIfError(error, "Failed to save location.");
  return data as CaseLocationRow;
}

export async function listCaseLocationsForUser(
  caseId: string,
  userId: string,
  limit = 20
): Promise<CaseLocationRow[]> {
  const owns = await getCaseForUser(caseId, userId);
  if (!owns) throw new LocationAccessError();
  const { data, error } = await getSupabaseServer()
    .from("case_locations")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(100, limit)));
  throwIfError(error, "Failed to list locations.");
  return (data || []) as CaseLocationRow[];
}

/**
 * Government read path: NO owner check here by design. Callers MUST enforce
 * requireScopedCase + case.view_pii + purpose + mandatory audit (see
 * app/api/gov/cases/[caseId]/location/route.ts). Exposed fields are the
 * minimum necessary: coordinates, accuracy, source, timestamps, actor id.
 */
export async function listCaseLocationsForGov(caseId: string): Promise<CaseLocationRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("case_locations")
    .select("id,case_id,actor_id,latitude,longitude,accuracy_m,source,captured_at,created_at")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false })
    .limit(50);
  throwIfError(error, "Failed to list locations.");
  return (data || []) as CaseLocationRow[];
}
