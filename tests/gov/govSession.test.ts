import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import { getSupabaseServer } from "../../lib/supabaseServer";
import {
  GOV_SESSION_TOKEN_BYTES,
  generateGovSessionToken,
  hashGovSessionToken,
} from "../../lib/gov/govSessionId";
import {
  GOV_SESSION_COOKIE_NAME,
  GOV_SESSION_COOKIE_PATH,
  govSessionClearCookieAttributes,
  govSessionCookieAttributes,
  isValidGovSessionCookieValue,
  parseGovSessionCookieHeader,
} from "../../lib/gov/govCookie";
import {
  GOV_BCRYPT_COST,
  GOV_LOCKOUT_MS,
  GOV_MAX_FAILED_ATTEMPTS,
  buildGovFailurePatch,
  govLockoutUntil,
  hashGovPassword,
  isGovAccountLocked,
  normalizeGovEmail,
  verifyGovPassword,
  type GovCredentialRow,
  type GovOfficerRow,
} from "../../lib/gov/govCredentials";
import {
  GOV_MFA_FRESHNESS_MS,
  GOV_SESSION_ABSOLUTE_TTL_MS,
  GOV_SESSION_IDLE_TTL_MS,
  GOV_SESSION_SEEN_THROTTLE_MS,
  bumpGovSessionVersion,
  createGovSession,
  evaluateGovSession,
  isMfaFresh,
  shouldRefreshLastSeen,
  toGovOfficerContext,
  validateGovSessionToken,
  type GovSessionRow,
} from "../../lib/gov/govSession";
import {
  GOV_DUMMY_COMPARE_HASH,
  GOV_LOGIN_FAILED_MESSAGE,
  attemptGovLogin,
  govDummyCompare,
  type GovLoginStore,
} from "../../lib/gov/govAuth";

vi.mock("../../lib/supabaseServer", () => ({ getSupabaseServer: vi.fn() }));

const mockedSupabaseServer = vi.mocked(getSupabaseServer);

const NOW = new Date("2026-09-20T12:00:00.000Z").getTime();
const iso = (ms: number): string => new Date(ms).toISOString();

function officerRow(overrides: Partial<GovOfficerRow> = {}): GovOfficerRow {
  return {
    id: "officer-1",
    officer_code: "GOV-DL-000123",
    full_name: "Test Officer",
    official_email: "officer@example.gov.in",
    official_phone: null,
    role: "INVESTIGATOR",
    status: "ACTIVE",
    department: null,
    scope: "DISTRICT",
    state_code: "DL",
    district_code: "DL-07",
    session_version: 3,
    created_at: iso(NOW - 100000),
    updated_at: iso(NOW - 100000),
    last_login_at: null,
    created_by: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    ...overrides,
  };
}

function sessionRow(overrides: Partial<GovSessionRow> = {}): GovSessionRow {
  return {
    id: "session-1",
    officer_id: "officer-1",
    session_token_hash: "hash",
    session_version: 3,
    mfa_level: "pwd",
    mfa_verified_at: null,
    issued_at: iso(NOW - 60_000),
    expires_at: iso(NOW + 60_000),
    last_seen_at: iso(NOW - 60_000),
    revoked_at: null,
    revoked_by: null,
    revoke_reason: null,
    ip: null,
    user_agent: null,
    ...overrides,
  };
}

function credentialRow(overrides: Partial<GovCredentialRow> = {}): GovCredentialRow {
  return {
    officer_id: "officer-1",
    password_hash: "hash",
    password_updated_at: iso(NOW - 1000),
    must_rotate: false,
    cred_status: "ACTIVE",
    failed_attempts: 0,
    locked_until: null,
    created_at: iso(NOW - 1000),
    updated_at: iso(NOW - 1000),
    ...overrides,
  };
}

describe("session token generation", () => {
  it("is cryptographically random with 32 bytes of entropy", () => {
    const a = generateGovSessionToken();
    const b = generateGovSessionToken();
    expect(a).not.toBe(b);
    for (const token of [a, b]) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(GOV_SESSION_TOKEN_BYTES);
    }
  });

  it("hashes deterministically with SHA-256 hex", () => {
    const token = generateGovSessionToken();
    const expected = createHash("sha256").update(token, "utf8").digest("hex");
    expect(hashGovSessionToken(token)).toBe(expected);
    expect(hashGovSessionToken(token)).toHaveLength(64);
  });
});

describe("session evaluation", () => {
  it("accepts a valid session and flags refresh after the throttle", () => {
    const result = evaluateGovSession(
      sessionRow({ last_seen_at: iso(NOW - GOV_SESSION_SEEN_THROTTLE_MS - 1000) }),
      officerRow(),
      NOW,
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.refreshLastSeen).toBe(true);
      expect(result.officer.id).toBe("officer-1");
      expect(result.session.id).toBe("session-1");
    }
  });

  it("rejects expired sessions (absolute)", () => {
    const result = evaluateGovSession(
      sessionRow({ expires_at: iso(NOW - 1) }),
      officerRow(),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "absolute_expired" });
  });

  it("rejects idle sessions", () => {
    const result = evaluateGovSession(
      sessionRow({ last_seen_at: iso(NOW - GOV_SESSION_IDLE_TTL_MS - 1) }),
      officerRow(),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "idle_expired" });
  });

  it("rejects revoked sessions", () => {
    const result = evaluateGovSession(
      sessionRow({ revoked_at: iso(NOW - 10) }),
      officerRow(),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("rejects session-version mismatch", () => {
    const result = evaluateGovSession(
      sessionRow({ session_version: 2 }),
      officerRow({ session_version: 3 }),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "version_mismatch" });
  });

  it("rejects inactive, suspended, pending, and revoked officers", () => {
    for (const status of ["PENDING", "SUSPENDED", "REVOKED"] as const) {
      const result = evaluateGovSession(sessionRow(), officerRow({ status }), NOW);
      expect(result).toEqual({ valid: false, reason: "officer_inactive" });
    }
  });

  it("rejects missing officers", () => {
    expect(evaluateGovSession(sessionRow(), null, NOW)).toEqual({
      valid: false,
      reason: "officer_missing",
    });
  });

  it("never refreshes last_seen_at before idle validation passes", () => {
    let refreshed = false;
    const result = evaluateGovSession(
      sessionRow({ last_seen_at: iso(NOW - GOV_SESSION_IDLE_TTL_MS - 1) }),
      officerRow(),
      NOW,
    );
    if (result.valid) refreshed = result.refreshLastSeen;
    expect(result.valid).toBe(false);
    expect(refreshed).toBe(false);
  });

  it("throttles refresh at the five-minute boundary", () => {
    expect(shouldRefreshLastSeen(iso(NOW - GOV_SESSION_SEEN_THROTTLE_MS), NOW)).toBe(true);
    expect(shouldRefreshLastSeen(iso(NOW - GOV_SESSION_SEEN_THROTTLE_MS + 1000), NOW)).toBe(
      false,
    );
    expect(shouldRefreshLastSeen(iso(NOW), NOW)).toBe(false);
  });

  it("loads a secret-free officer context", () => {
    const context = toGovOfficerContext(officerRow());
    expect(context).toEqual({
      officerId: "officer-1",
      officerCode: "GOV-DL-000123",
      role: "INVESTIGATOR",
      status: "ACTIVE",
      scope: "DISTRICT",
      stateCode: "DL",
      districtCode: "DL-07",
      sessionVersion: 3,
    });
    expect(JSON.stringify(context)).not.toContain("hash");
  });
});

describe("MFA freshness", () => {
  it("requires verification within 15 minutes and never treats pwd-only as fresh", () => {
    expect(isMfaFresh(null, NOW)).toBe(false);
    expect(isMfaFresh(iso(NOW - GOV_MFA_FRESHNESS_MS + 1000), NOW)).toBe(true);
    expect(isMfaFresh(iso(NOW - GOV_MFA_FRESHNESS_MS), NOW)).toBe(false);
    expect(GOV_MFA_FRESHNESS_MS).toBe(15 * 60 * 1000);
  });
});

describe("government cookie contract", () => {
  it("uses the approved name, path, and flags with Secure always true", () => {
    expect(GOV_SESSION_COOKIE_NAME).toBe("__Secure-gov-session");
    expect(GOV_SESSION_COOKIE_PATH).toBe("/gov");
    const attrs = govSessionCookieAttributes();
    expect(attrs).toEqual({
      name: "__Secure-gov-session",
      path: "/gov",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 12 * 60 * 60,
    });
    expect("domain" in attrs).toBe(false);
  });

  it("clears on the same path with zero max-age", () => {
    const cleared = govSessionClearCookieAttributes();
    expect(cleared.path).toBe("/gov");
    expect(cleared.maxAge).toBe(0);
    expect(cleared.secure).toBe(true);
  });

  it("rejects values containing cookie delimiters", () => {
    expect(isValidGovSessionCookieValue(generateGovSessionToken())).toBe(true);
    expect(isValidGovSessionCookieValue("")).toBe(false);
    expect(isValidGovSessionCookieValue("a;b")).toBe(false);
    expect(isValidGovSessionCookieValue("a b")).toBe(false);
  });
});

describe("government credentials", () => {
  it("normalizes email by trimming and lowercasing", () => {
    expect(normalizeGovEmail("  Officer@Example.GOV.IN ")).toBe("officer@example.gov.in");
  });

  it("hashes at bcrypt cost 12 and verifies", async () => {
    const started = Date.now();
    const hash = await hashGovPassword("Correct Horse Battery Staple 12!");
    const elapsed = Date.now() - started;
    expect(bcrypt.getRounds(hash)).toBe(GOV_BCRYPT_COST);
    expect(await verifyGovPassword("Correct Horse Battery Staple 12!", hash)).toBe(true);
    expect(await verifyGovPassword("wrong password", hash)).toBe(false);
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it("evaluates lockout from attempts and locked_until", () => {
    expect(isGovAccountLocked(credentialRow(), NOW)).toBe(false);
    expect(
      isGovAccountLocked(
        credentialRow({
          failed_attempts: GOV_MAX_FAILED_ATTEMPTS,
          locked_until: iso(NOW + 1000),
        }),
        NOW,
      ),
    ).toBe(true);
    expect(
      isGovAccountLocked(
        credentialRow({
          failed_attempts: GOV_MAX_FAILED_ATTEMPTS,
          locked_until: iso(NOW - 1000),
        }),
        NOW,
      ),
    ).toBe(false);
    expect(isGovAccountLocked(credentialRow({ cred_status: "LOCKED" }), NOW)).toBe(true);
    expect(isGovAccountLocked(credentialRow({ cred_status: "REVOKED" }), NOW)).toBe(true);
    expect(govLockoutUntil(NOW)).toBe(iso(NOW + GOV_LOCKOUT_MS));
  });
});

describe("government login", () => {
  function storeWith(officer: GovOfficerRow | null, password: string): {
    store: GovLoginStore;
    calls: { failures: number; resets: number };
  } {
    const calls = { failures: 0, resets: 0 };
    const store: GovLoginStore = {
      findOfficerByEmail: () => Promise.resolve(officer),
      findOfficerByCode: () => Promise.resolve(officer),
      getCredential: () =>
        Promise.resolve(officer ? credentialRow({ officer_id: officer.id }) : null),
      verifyPassword: (plain) => Promise.resolve(plain === password),
      dummyCompare: () => Promise.resolve(),
      recordFailure: () => {
        calls.failures += 1;
        return Promise.resolve();
      },
      resetFailures: () => {
        calls.resets += 1;
        return Promise.resolve();
      },
      issueSession: (o) =>
        Promise.resolve({ token: "raw-token", session: sessionRow({ officer_id: o.id }) }),
    };
    return { store, calls };
  }

  it("returns the identical generic error for unknown email and wrong password", async () => {
    const unknown = await attemptGovLogin(
      "nobody@example.gov.in",
      "wrong",
      storeWith(null, "right").store,
    );
    const wrongPassword = await attemptGovLogin(
      "officer@example.gov.in",
      "wrong",
      storeWith(officerRow(), "right").store,
    );
    expect(unknown).toEqual({ ok: false, message: GOV_LOGIN_FAILED_MESSAGE });
    expect(wrongPassword).toEqual({ ok: false, message: GOV_LOGIN_FAILED_MESSAGE });
    expect(unknown).toEqual(wrongPassword);
  });

  it("returns the generic error for locked and inactive officers", async () => {
    const lockedStore: GovLoginStore = {
      ...storeWith(officerRow(), "right").store,
      getCredential: () =>
        Promise.resolve(
          credentialRow({ failed_attempts: 99, locked_until: iso(Date.now() + 60000) }),
        ),
    };
    expect(await attemptGovLogin("officer@example.gov.in", "right", lockedStore)).toEqual({
      ok: false,
      message: GOV_LOGIN_FAILED_MESSAGE,
    });
    for (const status of ["PENDING", "SUSPENDED", "REVOKED"] as const) {
      const result = await attemptGovLogin(
        "officer@example.gov.in",
        "right",
        storeWith(officerRow({ status }), "right").store,
      );
      expect(result).toEqual({ ok: false, message: GOV_LOGIN_FAILED_MESSAGE });
    }
  });

  it("succeeds without exposing secrets and resets failures", async () => {
    const { store, calls } = storeWith(officerRow(), "right");
    const result = await attemptGovLogin("officer@example.gov.in", "right", store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.token).toBe("raw-token");
      expect(result.officer.officerId).toBe("officer-1");
      expect(JSON.stringify(result)).not.toContain("password_hash");
    }
    expect(calls.resets).toBe(1);
    expect(calls.failures).toBe(0);
  });
});

describe("dummy timing comparison (Fix 1)", () => {
  it("uses a structurally valid cost-12 hash", () => {
    expect(bcrypt.getRounds(GOV_DUMMY_COMPARE_HASH)).toBe(GOV_BCRYPT_COST);
    expect(GOV_DUMMY_COMPARE_HASH.startsWith("$2b$12$")).toBe(true);
  });

  it("returns false without throwing and exposes no secret", async () => {
    await expect(govDummyCompare()).resolves.toBe(false);
  });

  it("performs real cost-12 work within a bounded ratio of a real comparison", async () => {
    // Environment-dependent by nature (CPU speed, load): medians over 3 runs
    // plus generous bounds keep this robust. It proves the dummy path does
    // full bcrypt work (~hundreds of ms) instead of failing fast (~1ms for
    // a malformed hash), without claiming exact timing equality.
    const realHash = await hashGovPassword("some government password");
    async function medianMs(task: () => Promise<unknown>): Promise<number> {
      const samples: number[] = [];
      for (let i = 0; i < 3; i += 1) {
        const start = Date.now();
        await task();
        samples.push(Date.now() - start);
      }
      samples.sort((a, b) => a - b);
      return samples[1];
    }
    const dummyMedian = await medianMs(() => govDummyCompare());
    const realMedian = await medianMs(() => verifyGovPassword("wrong password", realHash));
    expect(dummyMedian).toBeGreaterThanOrEqual(50);
    expect(dummyMedian).toBeLessThan(30_000);
    expect(dummyMedian / Math.max(realMedian, 1)).toBeLessThan(10);
    expect(realMedian / Math.max(dummyMedian, 1)).toBeLessThan(10);
  }, 120_000);
});

describe("failure patch builder (Fix 2)", () => {
  it("increments normally without locking below the budget", () => {
    expect(buildGovFailurePatch(2, NOW)).toEqual({
      failed_attempts: 3,
      locked_until: null,
      updated_at: iso(NOW),
    });
  });

  it("sets locked_until exactly at the threshold and above", () => {
    expect(buildGovFailurePatch(GOV_MAX_FAILED_ATTEMPTS - 1, NOW)).toEqual({
      failed_attempts: GOV_MAX_FAILED_ATTEMPTS,
      locked_until: iso(NOW + GOV_LOCKOUT_MS),
      updated_at: iso(NOW),
    });
    const over = buildGovFailurePatch(GOV_MAX_FAILED_ATTEMPTS + 2, NOW);
    expect(over.failed_attempts).toBe(GOV_MAX_FAILED_ATTEMPTS + 3);
    expect(over.locked_until).toBe(iso(NOW + GOV_LOCKOUT_MS));
  });

  it("never produces negative or NaN counts", () => {
    expect(buildGovFailurePatch(-3, NOW).failed_attempts).toBe(1);
    expect(buildGovFailurePatch(Number.NaN, NOW).failed_attempts).toBe(1);
    expect(buildGovFailurePatch(-3, NOW).locked_until).toBeNull();
  });

  it("returns plain data with no secrets", () => {
    const patch = buildGovFailurePatch(0, NOW);
    expect(Object.keys(patch).sort()).toEqual([
      "failed_attempts",
      "locked_until",
      "updated_at",
    ]);
    expect(JSON.stringify(patch)).not.toMatch(/password|hash|token/i);
  });
});

describe("version bump error propagation (Fix 3)", () => {
  type DbResult = {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  interface Call {
    table: string;
    op: string;
    patch?: unknown;
  }

  function fakeClient(script: { selectOne: DbResult; updates: DbResult[] }, calls: Call[]) {
    class FakeQuery {
      private op: "select" | "update" = "select";
      private patch: unknown = undefined;
      select(): this {
        this.op = "select";
        return this;
      }
      update(patch: unknown): this {
        this.op = "update";
        this.patch = patch;
        return this;
      }
      eq(): this {
        return this;
      }
      is(): this {
        return this;
      }
      gt(): this {
        return this;
      }
      maybeSingle(): Promise<DbResult> {
        calls.push({ table: "t", op: "selectOne" });
        return Promise.resolve(script.selectOne);
      }
      single(): Promise<DbResult> {
        calls.push({ table: "t", op: "single" });
        return Promise.resolve(script.selectOne);
      }
      then(
        onFulfilled: (value: DbResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ): Promise<unknown> {
        if (this.op === "update") {
          calls.push({ table: "t", op: "update", patch: this.patch });
          const next =
            script.updates.length > 0
              ? (script.updates.shift() as DbResult)
              : { data: null, error: null };
          return Promise.resolve(next).then(onFulfilled, onRejected);
        }
        return Promise.resolve(script.selectOne).then(onFulfilled, onRejected);
      }
    }
    return { from: () => new FakeQuery() };
  }

  function mockDb(selectOne: DbResult, updates: DbResult[]): Call[] {
    const calls: Call[] = [];
    mockedSupabaseServer.mockReturnValue(
      fakeClient({ selectOne, updates }, calls) as unknown as ReturnType<
        typeof getSupabaseServer
      >,
    );
    return calls;
  }

  it("bumps the version and stamps live sessions revoked", async () => {
    const calls = mockDb(
      { data: { session_version: 3 }, error: null },
      [
        { data: null, error: null },
        { data: null, error: null },
      ],
    );
    await expect(bumpGovSessionVersion("officer-1")).resolves.toBe(4);
    const updates = calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(2);
    expect(updates[0].patch).toMatchObject({ session_version: 4 });
    expect(updates[1].patch).toMatchObject({ revoke_reason: "session_version_bump" });
    expect(updates[1].patch).toHaveProperty("revoked_at");
  });

  it("propagates revoke-stamping failures instead of swallowing them", async () => {
    const calls = mockDb(
      { data: { session_version: 3 }, error: null },
      [{ data: null, error: null }, { data: null, error: { message: "stamp boom" } }],
    );
    await expect(bumpGovSessionVersion("officer-1")).rejects.toThrow("stamp boom");
    expect(calls.filter((c) => c.op === "update")).toHaveLength(2);
  });

  it("propagates bump failures without stamping sessions", async () => {
    const calls = mockDb(
      { data: { session_version: 3 }, error: null },
      [{ data: null, error: { message: "bump boom" } }],
    );
    await expect(bumpGovSessionVersion("officer-1")).rejects.toThrow("bump boom");
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
  });

  it("propagates officer-read failures", async () => {
    mockDb({ data: null, error: { message: "read boom" } }, []);
    await expect(bumpGovSessionVersion("officer-1")).rejects.toThrow("read boom");
  });

  it("starts from 1 when no version row is present", async () => {
    const calls = mockDb({ data: null, error: null }, [{ data: null, error: null }]);
    await expect(bumpGovSessionVersion("officer-1")).resolves.toBe(1);
    expect(calls.filter((c) => c.op === "update")).toHaveLength(2);
  });
});

describe("mandated validation order", () => {
  it("checks revocation before officer, version, and expiry", () => {
    const result = evaluateGovSession(
      sessionRow({ revoked_at: iso(NOW - 10), expires_at: iso(NOW - 10) }),
      null,
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "revoked" });
  });

  it("checks officer status before version and expiry", () => {
    const result = evaluateGovSession(
      sessionRow({ session_version: 2, expires_at: iso(NOW - 10) }),
      officerRow({ status: "SUSPENDED", session_version: 3 }),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "officer_inactive" });
  });

  it("checks version before absolute and idle expiry", () => {
    const result = evaluateGovSession(
      sessionRow({
        session_version: 2,
        expires_at: iso(NOW - 10),
        last_seen_at: iso(NOW - GOV_SESSION_IDLE_TTL_MS - 1),
      }),
      officerRow({ session_version: 3 }),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "version_mismatch" });
  });

  it("checks absolute expiry before idle expiry", () => {
    const result = evaluateGovSession(
      sessionRow({
        expires_at: iso(NOW - 10),
        last_seen_at: iso(NOW - GOV_SESSION_IDLE_TTL_MS - 1),
      }),
      officerRow(),
      NOW,
    );
    expect(result).toEqual({ valid: false, reason: "absolute_expired" });
  });

  it("loads MFA freshness context on valid sessions", () => {
    const fresh = evaluateGovSession(
      sessionRow({ mfa_verified_at: iso(NOW - 60_000) }),
      officerRow(),
      NOW,
    );
    expect(fresh.valid).toBe(true);
    if (fresh.valid) expect(fresh.mfaFresh).toBe(true);
    const pwdOnly = evaluateGovSession(sessionRow({ mfa_verified_at: null }), officerRow(), NOW);
    expect(pwdOnly.valid).toBe(true);
    if (pwdOnly.valid) expect(pwdOnly.mfaFresh).toBe(false);
  });
});

describe("cookie header reading", () => {
  const token = "AbC123_-xYz";

  it("extracts the government session token", () => {
    expect(parseGovSessionCookieHeader(`${GOV_SESSION_COOKIE_NAME}=${token}`)).toBe(token);
    expect(
      parseGovSessionCookieHeader(`other=1; ${GOV_SESSION_COOKIE_NAME}=${token}; x=2`),
    ).toBe(token);
  });

  it("returns null for missing, foreign, duplicate, or malformed values", () => {
    expect(parseGovSessionCookieHeader(null)).toBeNull();
    expect(parseGovSessionCookieHeader(undefined)).toBeNull();
    expect(parseGovSessionCookieHeader("")).toBeNull();
    expect(parseGovSessionCookieHeader("other=1")).toBeNull();
    expect(
      parseGovSessionCookieHeader(
        `${GOV_SESSION_COOKIE_NAME}=a; ${GOV_SESSION_COOKIE_NAME}=b`,
      ),
    ).toBeNull();
    expect(parseGovSessionCookieHeader(`${GOV_SESSION_COOKIE_NAME}=`)).toBeNull();
    expect(parseGovSessionCookieHeader(`${GOV_SESSION_COOKIE_NAME}=a b`)).toBeNull();
    expect(parseGovSessionCookieHeader(`${GOV_SESSION_COOKIE_NAME}=a,b`)).toBeNull();
  });

  it("treats semicolons as cookie separators per header semantics", () => {
    expect(parseGovSessionCookieHeader(`${GOV_SESSION_COOKIE_NAME}=a;b`)).toBe("a");
  });
});

describe("token validation without a database", () => {
  it("rejects a missing token before any lookup", async () => {
    mockedSupabaseServer.mockImplementation(() => {
      throw new Error("database must not be touched for empty tokens");
    });
    await expect(validateGovSessionToken("", NOW)).resolves.toEqual({
      valid: false,
      reason: "not_found",
    });
    mockedSupabaseServer.mockReset();
  });
});

describe("unknown token hash and insert payload (mocked store)", () => {
  type DbResult = {
    data: unknown;
    error: { message: string; code?: string } | null;
  };

  function mockStore(selectOne: DbResult, inserted: Record<string, unknown>) {
    const seen: { insertPatch?: unknown; selects: number } = { selects: 0 };
    function chain(op: "select" | "insert", patch?: unknown) {
      if (op === "insert") seen.insertPatch = patch;
      const self = {
        select: () => self,
        insert: (p: unknown) => chain("insert", p),
        eq: () => self,
        is: () => self,
        gt: () => self,
        maybeSingle: () => {
          seen.selects += 1;
          return Promise.resolve(selectOne);
        },
        single: () => Promise.resolve({ data: inserted, error: null }),
        then: (
          onFulfilled: (value: DbResult) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) => Promise.resolve(selectOne).then(onFulfilled, onRejected),
      };
      return self;
    }
    mockedSupabaseServer.mockReturnValue({ from: () => chain("select") } as unknown as ReturnType<
      typeof getSupabaseServer
    >);
    return seen;
  }

  it("returns not_found for an unknown token hash without officer lookup", async () => {
    const seen = mockStore({ data: null, error: null }, {});
    await expect(validateGovSessionToken(generateGovSessionToken(), NOW)).resolves.toEqual({
      valid: false,
      reason: "not_found",
    });
    expect(seen.selects).toBe(1);
    mockedSupabaseServer.mockReset();
  });

  it("stores only the token hash and never the raw token", async () => {
    const inserted = { id: "session-9", session_token_hash: "stored" };
    const seen = mockStore({ data: null, error: null }, inserted);
    const { token, session } = await createGovSession(officerRow());
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(seen.insertPatch).toMatchObject({
      officer_id: "officer-1",
      session_version: 3,
      mfa_level: "pwd",
      mfa_verified_at: null,
    });
    const patch = seen.insertPatch as Record<string, unknown>;
    expect(patch["session_token_hash"]).toMatch(/^[0-9a-f]{64}$/);
    expect(patch["session_token_hash"]).toBe(hashGovSessionToken(token));
    for (const value of Object.values(patch)) {
      if (typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value)) {
        throw new Error("raw session token leaked into insert payload");
      }
    }
    expect(session).toEqual(inserted);
    mockedSupabaseServer.mockReset();
  });
});
