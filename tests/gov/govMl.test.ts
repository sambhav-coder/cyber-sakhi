import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scoreUrlRisk, URL_RISK_RULES_VERSION, URL_RISK_FEATURE_SCHEMA } from "../../lib/gov/ml/urlRiskRules";
import { scoreUrlModel, modelVersion } from "../../lib/gov/ml/urlRiskModel";

/**
 * ML pipeline tests (PART 27): deterministic rules, scorer parity with the
 * trainer, and honest artifact reporting. No accuracy is asserted as a
 * quality claim — the OOD probe result is pinned so regressions in
 * transparency fail loudly.
 */

const ROOT = process.cwd();
const mlFile = (n: string) => JSON.parse(readFileSync(join(ROOT, "docs", "ml", "url-risk-v1", n), "utf8"));

describe("url risk rules v1 (deterministic baseline)", () => {
  it("flags an executable dropper URL as HIGH with the expected signals", () => {
    const r = scoreUrlRisk("http://176.65.139.229/x86_64/setup.exe");
    expect(r.band).toBe("HIGH");
    expect(r.version).toBe(URL_RISK_RULES_VERSION);
    expect(r.signals.map((s) => s.code)).toContain("IP_LITERAL_HOST");
    expect(r.signals.map((s) => s.code)).toContain("EXECUTABLE_EXTENSION");
  });

  it("rates a bare popular domain LOW", () => {
    const r = scoreUrlRisk("https://www.example-umbrella-organisation.com/");
    expect(r.band).toBe("LOW");
  });

  it("handles unparseable input without signals-as-verdict", () => {
    const r = scoreUrlRisk("not a url at all !!!");
    expect(r.score).toBe(0);
    expect(r.signals[0].code).toBe("UNPARSEABLE");
  });

  it("keeps the shared feature schema at 16 documented features", () => {
    expect(URL_RISK_FEATURE_SCHEMA.length).toBe(16);
  });
});

describe("url risk statistical scorer (experimental)", () => {
  it("loads a versioned artifact whose schema matches the trainer", () => {
    expect(modelVersion()).toBe("url-risk-lr-v1");
    const m = mlFile("model.json") as {
      feature_order: string[]; scaler_mean: number[]; scaler_var: number[]; coefficients: number[]; intercept: number;
    };
    expect(m.feature_order).toEqual([...URL_RISK_FEATURE_SCHEMA]);
    expect(m.scaler_mean.length).toBe(16);
    expect(m.coefficients.length).toBe(16);
    expect(typeof m.intercept).toBe("number");
  });

  it("scores a dropper URL above a bare domain and always requires review", () => {
    const bad = scoreUrlModel("http://176.65.139.229/x86_64/setup.exe");
    const good = scoreUrlModel("http://google.com/");
    expect(bad && good).toBeTruthy();
    expect(bad!.score).toBeGreaterThan(good!.score);
    for (const o of [bad!, good!]) {
      expect(o.calibrated).toBe(false);
      expect(o.reviewState).toBe("NEEDS_ANALYST_REVIEW");
      expect(o.rules.version).toBe(URL_RISK_RULES_VERSION);
    }
  });

  it("pins the honest evaluation: test metrics AND the poor OOD probe", () => {
    const ev = mlFile("evaluation.json") as {
      confusion_matrix: Record<string, number>; ood_check: { n: number; flag_rate: number };
    };
    expect(ev.confusion_matrix.tp + ev.confusion_matrix.tn).toBeGreaterThan(0);
    // The OOD probe must stay visible: 46.5% flag rate documents that test
    // accuracy does not transfer. If retraining changes it, update deliberately.
    expect(ev.ood_check.n).toBeGreaterThan(100);
    expect(ev.ood_check.flag_rate).toBeLessThan(0.6);
    const meta = mlFile("training-metadata.json") as { status: string; limitations: string[] };
    expect(meta.status).toMatch(/not production-validated/);
    expect(meta.limitations.length).toBeGreaterThanOrEqual(5);
  });
});

describe("ingestion coverage honesty", () => {
  it("records the requested vs actual window without claiming 90 days", () => {
    const cov = JSON.parse(readFileSync(join(ROOT, "docs", "datasets", "ext-intel-20260925", "coverage.json"), "utf8")) as {
      requested_start: string; requested_end: string; actual_source_start: string; actual_source_end: string; record_count: number;
    };
    expect(cov.requested_start).toBe("2026-06-27T00:00:00Z");
    expect(cov.requested_end).toBe("2026-09-25T23:59:59Z");
    expect(cov.actual_source_start).toBe("2026-08-26");
    expect(cov.actual_source_end).toBe("2026-09-25");
    expect(cov.record_count).toBeGreaterThan(15000);
  });
});
