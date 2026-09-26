import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { evaluateGovGuard } from "../../lib/gov/govGuard";
import type { GovSessionEvaluation, GovSessionRow } from "../../lib/gov/govSession";
import type { GovOfficerRow } from "../../lib/gov/govCredentials";
import { roleHasDefaultPermission } from "../../lib/gov/govPermissions";
import { generateGovSessionToken, hashGovSessionToken } from "../../lib/gov/govSessionId";
import { GovRateLimiter } from "../../lib/gov/govRateLimit";
import { govDashboardWindow } from "../../lib/gov/govQueries";
import { GOV_SESSION_COOKIE_NAME, GOV_SESSION_COOKIE_PATH } from "../../lib/gov/govCookie";

/**
 * PART 21 attack-surface suite (all DB-free).
 *
 * Each test names the attack, performs it against the real guard /
 * primitive, and asserts the fail-closed outcome. Live HTTP checks
 * (redirects, 401s) and checks requiring a database are recorded in
 * docs/security-test-report.md, not pretended here.
 */

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

const baseOfficer: GovOfficerRow = {
  id: "off-attack-1",
  officer_code: "GOV-00-ATK",
  full_name: "Attack Surface Officer",
  official_email: "atk@gov.test",
  official_phone: null,
  role: "INVESTIGATOR",
  status: "ACTIVE",
  department: null,
  scope: "STATE",
  state_code: "MH",
  district_code: null,
  session_version: 1,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  last_login_at: null,
  created_by: null,
  deactivated_at: null,
  deactivated_by: null,
  deactivation_reason: null,
};

const sessionStub: GovSessionRow = {
  id: "sess-atk-1",
  officer_id: baseOfficer.id,
  session_token_hash: "deadbeef",
  session_version: 1,
  mfa_level: "pwd",
  mfa_verified_at: null,
  issued_at: "2026-01-01T00:00:00.000Z",
  expires_at: "2026-01-02T00:00:00.000Z",
  last_seen_at: "2026-01-01T00:00:00.000Z",
  revoked_at: null,
  revoked_by: null,
  revoke_reason: null,
  ip: null,
  user_agent: null,
};

const validEval = (officer: GovOfficerRow = baseOfficer): Extract<GovSessionEvaluation, { valid: true }> => ({
  valid: true,
  officer,
  session: sessionStub,
  refreshLastSeen: false,
  mfaFresh: false,
});

function collectTsx(dir: string): string[] {
  const out: string[] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTsx(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("PART 21: session and role attacks", () => {
  it("rejects requests with no/invalid session as 401 (forged session cannot pass)", () => {
    const d = evaluateGovGuard({ valid: false, reason: "not_found" }, "case.view");
    expect(d).toEqual({ allow: false, status: 401, code: "UNAUTHORIZED", reason: "not_found" });
  });

  it("denies 403 when a valid officer lacks the permission (wrong role)", () => {
    // INVESTIGATOR holds no analytics.view: cross-module hopping fails closed.
    expect(roleHasDefaultPermission("INVESTIGATOR", "analytics.view")).toBe(false);
    const d = evaluateGovGuard(validEval(), "analytics.view");
    expect(d).toMatchObject({ allow: false, status: 403, code: "PERMISSION_DENIED" });
  });

  it("denies unknown roles and unknown permissions fail-closed", () => {
    expect(roleHasDefaultPermission("FIELD_MARSHAL" as never, "case.view")).toBe(false);
    expect(roleHasDefaultPermission("STATE_ADMIN", "case.delete_everything" as never)).toBe(false);
    const d = evaluateGovGuard(validEval({ ...baseOfficer, role: "FIELD_MARSHAL" as never }), "case.view");
    expect(d.allow).toBe(false);
  });

  it("keeps the gov session cookie scoped to /gov under a gov-only name (user sessions do not overlap)", () => {
    expect(GOV_SESSION_COOKIE_PATH).toBe("/gov");
    expect(GOV_SESSION_COOKIE_NAME).not.toBe("next-auth.session-token");
    expect(GOV_SESSION_COOKIE_NAME).not.toBe("__Secure-next-auth.session-token");
  });
});

describe("PART 21: token forgery properties", () => {
  it("mints 256-bit CSPRNG tokens that are unique per call", () => {
    const a = generateGovSessionToken();
    const b = generateGovSessionToken();
    expect(a).not.toBe(b);
    expect(Buffer.from(a, "base64url").length).toBe(32);
  });

  it("stores only the SHA-256 hash (raw token never comparable to stored value)", () => {
    const raw = generateGovSessionToken();
    const stored = hashGovSessionToken(raw);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain(raw);
    expect(hashGovSessionToken("forged-token")).not.toBe(stored);
  });
});

describe("PART 21: scope confinement", () => {
  it("confines a STATE officer to their own state code (wrong-state data unreachable)", async () => {
    const { resolveGovScopeFilter, applyGovScopeFilter } = await import("../../lib/gov/govQueries");
    const filter = await resolveGovScopeFilter(baseOfficer);
    expect(filter).toEqual({ kind: "state", stateCode: "MH" });
    const calls: Array<[string, unknown]> = [];
    const stub = { eq: (c: string, v: unknown) => (calls.push([c, v]), stub) };
    applyGovScopeFilter(stub, filter);
    expect(calls).toEqual([["state_code", "MH"]]);
  });

  it("returns an empty assigned scope for officers with no assignments (unassigned-case probing yields nothing)", async () => {
    const { isScopeEmpty } = await import("../../lib/gov/govQueries");
    expect(isScopeEmpty({ kind: "assigned", caseIds: [] })).toBe(true);
    expect(isScopeEmpty({ kind: "state", stateCode: "MH" })).toBe(false);
  });

  it("hides row-level geo cases from geo-only roles (server strip pinned)", () => {
    const text = read("app", "gov", "api", "geo", "route.ts");
    expect(text).toContain("case.view_meta");
    expect(text).toMatch(/cases:\s*_stripped/);
  });
});

describe("PART 21: brute force and rate limits", () => {
  it("blocks the 11th unlock attempt inside the window and recovers after it", () => {
    const limiter = new GovRateLimiter(60_000, 10);
    for (let i = 0; i < 10; i++) expect(limiter.check("atk", 1000 + i).allowed).toBe(true);
    const blocked = limiter.check("atk", 2000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(limiter.check("atk", 1000 + 60_001).allowed).toBe(true);
  });

  it("pins login + MFA rate limiters on the login route", () => {
    const text = read("app", "gov", "api", "login", "route.ts");
    expect(text).toContain("govLoginRateLimiter");
    expect(text).toContain("govMfaRateLimiter");
  });
});

describe("PART 21: input abuse", () => {
  it("treats unparseable custom dates as unbounded, never as attacker-chosen defaults", () => {
    const w = govDashboardWindow("custom", "not-a-date", "also-bad");
    expect(w).toEqual({ label: "custom", from: null, to: null });
  });

  it("truncates attacker-controlled geo/trend filter strings server-side", () => {
    for (const f of ["app/gov/api/geo/map/route.ts", "app/gov/api/trends/route.ts"]) {
      expect(read(...f.split("/"))).toContain("slice(0, 120)");
    }
  });

  it("renders no raw HTML in government components (XSS: React escaping everywhere)", () => {
    const bad = collectTsx(join(ROOT, "components", "gov")).filter((f) =>
      readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"),
    );
    expect(bad).toEqual([]);
  });

  it("keeps private keys and provider secrets out of the gov surface", () => {
    const hits: string[] = [];
    for (const f of [...collectTsx(join(ROOT, "app", "gov")), ...collectTsx(join(ROOT, "lib", "gov"))]) {
      const t = readFileSync(f, "utf8");
      if (/BEGIN .*PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-live-|xox[bpas]-/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });
});

describe("PART 21: IDOR and data-source leakage", () => {
  it("answers missing and out-of-scope cases with one shared 404 (no existence oracle)", () => {
    const text = read("lib", "gov", "govApi.ts");
    expect(text).toContain("NOT_FOUND");
    expect(text).not.toMatch(/OUT_OF_SCOPE|not in your (jurisdiction|scope)/i);
  });

  it("keeps research corpora out of production aggregations (source separation pinned)", () => {
    const metrics = read("lib", "gov", "govQueries.ts");
    expect(metrics).toContain('.from("cases")');
    const policy = JSON.parse(read("docs", "datasets", "registry.json")) as { policy: string };
    expect(policy.policy).toMatch(/NEVER/);
  });
});
