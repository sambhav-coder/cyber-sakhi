import type { ThreatIndicator } from "@/lib/emailTypes";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import { isPersistableIndicator } from "@/lib/indicatorNormalize";
import type { IndicatorRow } from "./types";

export async function createIndicators(input: {
  investigationId?: string;
  caseId?: string;
  indicators: ThreatIndicator[];
}): Promise<IndicatorRow[]> {
  // Persistence gate (IOC quality): provably-malformed values
  // (qp tails, `http://www.=`, broken hosts) are dropped, never stored.
  // Unknown/other types pass through — the gate blocks garbage, not
  // unfamiliar vocabularies. Historical rows are untouched.
  const persistable = input.indicators.filter((indicator) =>
    isPersistableIndicator(indicator.type, indicator.value),
  );
  if (persistable.length === 0) return [];

  const { data, error } = await getSupabaseServer()
    .from("indicators")
    .insert(
      persistable.map((indicator) => ({
        investigation_id: input.investigationId ?? null,
        case_id: input.caseId ?? null,
        type: indicator.type,
        value: indicator.value,
        malicious: indicator.malicious ?? false,
        confidence: indicator.confidence ?? null,
        source: indicator.source ?? null,
      }))
    )
    .select("*");

  throwIfError(error, "Failed to save indicators.");
  return (data || []) as IndicatorRow[];
}