import type { ThreatIndicator } from "@/lib/emailTypes";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "./errors";
import type { IndicatorRow } from "./types";

export async function createIndicators(input: {
  investigationId?: string;
  caseId?: string;
  indicators: ThreatIndicator[];
}): Promise<IndicatorRow[]> {
  if (input.indicators.length === 0) return [];

  const { data, error } = await getSupabaseServer()
    .from("indicators")
    .insert(
      input.indicators.map((indicator) => ({
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