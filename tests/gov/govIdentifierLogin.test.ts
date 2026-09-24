import { describe, expect, it } from "vitest";
import {
  attemptGovIdentifierLogin,
  attemptGovLogin,
  GOV_LOGIN_FAILED_MESSAGE,
  resolveGovLoginIdentifier,
  type GovLoginStore,
} from "../../lib/gov/govAuth";
import type { GovCredentialRow, GovOfficerRow } from "../../lib/gov/govCredentials";

function officerRow(overrides: Partial<GovOfficerRow> = {}): GovOfficerRow {
  return {
    id: "officer-1",
    officer_code: "DL-CYB-0001",
    full_name: "Demo Officer",
    official_email: "demo.officer@gov.example",
    official_phone: null,
    role: "ANALYST",
    status: "ACTIVE",
    department: "SIH Demonstration",
    scope: "STATE",
    state_code: "DEMO",
    district_code: null,
    session_version: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    last_login_at: null,
    created_by: null,
    deactivated_at: null,
    deactivated_by: null,
    deactivation_reason: null,
    ...overrides,
  };
}

function credentialRow(overrides: Partial<GovCredentialRow> = {}): GovCredentialRow {
  return {
    officer_id: "officer-1",
    password_hash: "hash",
    password_updated_at: new Date(0).toISOString(),
    must_rotate: false,
    cred_status: "ACTIVE",
    failed_attempts: 0,
    locked_until: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  };
}

function fakeStore(officer: GovOfficerRow | null, passwordValid = true): GovLoginStore & {
  calls: { dummy: number; failures: number; resets: number; sessions: number };
} {
  const calls = { dummy: 0, failures: 0, resets: 0, sessions: 0 };
  return {
    calls,
    findOfficerByEmail: async (email) =>
      officer && officer.official_email === email ? officer : null,
    findOfficerByCode: async (code) =>
      officer && officer.officer_code === code.toUpperCase() ? officer : null,
    getCredential: async () => (officer ? credentialRow() : null),
    verifyPassword: async () => passwordValid,
    dummyCompare: async () => {
      calls.dummy += 1;
    },
    recordFailure: async () => {
      calls.failures += 1;
    },
    resetFailures: async () => {
      calls.resets += 1;
    },
    issueSession: async (found) => {
      calls.sessions += 1;
      return {
        token: "token",
        session: {
          id: "session-1",
          officer_id: found.id,
          session_token_hash: "hash",
          session_version: found.session_version,
          mfa_level: "pwd",
          mfa_verified_at: null,
          issued_at: new Date(0).toISOString(),
          expires_at: new Date(3600_000).toISOString(),
          last_seen_at: new Date(0).toISOString(),
          revoked_at: null,
          revoked_by: null,
          revoke_reason: null,
          ip: null,
          user_agent: null,
        },
      };
    },
  };
}

describe("resolveGovLoginIdentifier", () => {
  it("routes emails and Officer IDs without existence checks", () => {
    expect(resolveGovLoginIdentifier("Officer@Gov.Example ")).toEqual({
      kind: "email",
      value: "officer@gov.example",
    });
    expect(resolveGovLoginIdentifier(" dl-cyb-0001 ")).toEqual({
      kind: "code",
      value: "DL-CYB-0001",
    });
  });
});

describe("attemptGovIdentifierLogin", () => {
  it("succeeds by Officer ID and by email for the same officer", async () => {
    const officer = officerRow();
    const byCode = await attemptGovIdentifierLogin("dl-cyb-0001", "pw", fakeStore(officer));
    const byEmail = await attemptGovIdentifierLogin(
      "demo.officer@gov.example",
      "pw",
      fakeStore(officer),
    );
    expect(byCode.ok).toBe(true);
    expect(byEmail.ok).toBe(true);
    if (byCode.ok && byEmail.ok) {
      expect(byCode.officer.officerId).toBe(byEmail.officer.officerId);
    }
  });

  it("returns the identical generic message for unknown, inactive, and wrong-password paths", async () => {
    const unknown = await attemptGovIdentifierLogin("DL-CYB-9999", "pw", fakeStore(null));
    const inactive = await attemptGovIdentifierLogin(
      "DL-CYB-0001",
      "pw",
      fakeStore(officerRow({ status: "SUSPENDED" })),
    );
    const wrongPw = await attemptGovIdentifierLogin("DL-CYB-0001", "pw", fakeStore(officerRow(), false));
    for (const result of [unknown, inactive, wrongPw]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toBe(GOV_LOGIN_FAILED_MESSAGE);
    }
  });

  it("timing-equalizes the unknown-identifier path and records real failures", async () => {
    const unknownStore = fakeStore(null);
    const result = await attemptGovIdentifierLogin("DL-CYB-9999", "pw", unknownStore);
    expect(result.ok).toBe(false);
    expect(unknownStore.calls.dummy).toBe(1);
    expect(unknownStore.calls.failures).toBe(0);

    const badPwStore = fakeStore(officerRow(), false);
    await attemptGovIdentifierLogin("DL-CYB-0001", "pw", badPwStore);
    expect(badPwStore.calls.failures).toBe(1);
    expect(badPwStore.calls.sessions).toBe(0);
  });

  it("legacy email login keeps working unchanged", async () => {
    const result = await attemptGovLogin("demo.officer@gov.example", "pw", fakeStore(officerRow()));
    expect(result.ok).toBe(true);
  });
});
