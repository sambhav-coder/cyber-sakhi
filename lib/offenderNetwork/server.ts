import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  INDICATOR_TYPES,
  MAX_INDICATORS_PER_REQUEST,
  type IndicatorType,
} from "./constants";
import { hashIndicator, hashReporter } from "./hash";
import { normalizeIndicator } from "./indicators";

/* ------------------------------------------------------------------ *
 * Request helpers shared by the Sakhi Network routes — SERVER ONLY.
 * ------------------------------------------------------------------ */

/**
 * The signed-in account, fingerprinted. Null when signed out: looking up
 * is open to anyone, but only an account can add a report, so one person
 * cannot inflate a count by clearing cookies.
 */
export async function getRequesterHash(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const id = session?.user?.id;
  return id ? hashReporter(`user:${id}`) : null;
}

export interface ParsedIndicator {
  type: IndicatorType;
  hash: string;
}

/**
 * Re-validates every identifier the browser sent. Invalid entries become
 * null so the response can stay index-aligned with the request.
 */
export function parseIndicators(
  body: unknown
): { items: (ParsedIndicator | null)[] } | { error: string } {
  const list = (body as { indicators?: unknown })?.indicators;
  if (!Array.isArray(list)) return { error: "`indicators` must be an array." };
  if (list.length === 0) return { error: "No identifiers supplied." };
  if (list.length > MAX_INDICATORS_PER_REQUEST) {
    return { error: `At most ${MAX_INDICATORS_PER_REQUEST} identifiers per request.` };
  }

  const items = list.map((entry): ParsedIndicator | null => {
    const type = (entry as { type?: unknown })?.type;
    const value = (entry as { value?: unknown })?.value;
    if (typeof type !== "string" || !INDICATOR_TYPES.includes(type as IndicatorType)) {
      return null;
    }
    if (typeof value !== "string") return null;

    const normalized = normalizeIndicator(type as IndicatorType, value);
    if (!normalized) return null;
    return { type: type as IndicatorType, hash: hashIndicator(type as IndicatorType, normalized) };
  });

  return { items };
}

export function toDay(iso: string | null): string | null {
  return iso ? iso.slice(0, 10) : null;
}
