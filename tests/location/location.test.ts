import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  coarseCoordinates,
  validateLocationInput,
} from "../../lib/db/caseLocations";
import { AUDIT_ACTIONS, buildAuditEvent } from "../../lib/audit";

describe("validateLocationInput — no fake coordinates pass", () => {
  it("accepts valid GPS captures", () => {
    expect(
      validateLocationInput({ latitude: 28.6139, longitude: 77.209, accuracyM: 12 })
    ).toMatchObject({ latitude: 28.6139, longitude: 77.209, accuracyM: 12, source: "gps" });
    expect(validateLocationInput({ latitude: "-90", longitude: "180" })).toMatchObject({
      latitude: -90,
      longitude: 180,
      accuracyM: null,
    });
  });

  it("rejects out-of-range coordinates", () => {
    expect(validateLocationInput({ latitude: 91, longitude: 0 })).toBeNull();
    expect(validateLocationInput({ latitude: 0, longitude: 181 })).toBeNull();
    expect(validateLocationInput({ latitude: -91, longitude: 0 })).toBeNull();
  });

  it("rejects NaN, Infinity, and non-numeric input", () => {
    expect(validateLocationInput({ latitude: NaN, longitude: 0 })).toBeNull();
    expect(validateLocationInput({ latitude: Infinity, longitude: 0 })).toBeNull();
    expect(validateLocationInput({ latitude: "delhi", longitude: 0 })).toBeNull();
    expect(validateLocationInput({ latitude: undefined, longitude: 0 })).toBeNull();
    expect(validateLocationInput({ latitude: 28.6, longitude: null })).toBeNull();
  });

  it("rejects invalid accuracy", () => {
    expect(validateLocationInput({ latitude: 28, longitude: 77, accuracyM: -1 })).toBeNull();
    expect(validateLocationInput({ latitude: 28, longitude: 77, accuracyM: 200000 })).toBeNull();
    expect(validateLocationInput({ latitude: 28, longitude: 77, accuracyM: NaN })).toBeNull();
  });

  it("normalizes the source flag (never trusts free text)", () => {
    expect(validateLocationInput({ latitude: 28, longitude: 77, source: "manual" })).toMatchObject({
      source: "manual",
    });
    expect(validateLocationInput({ latitude: 28, longitude: 77, source: "satellite" })).toMatchObject({
      source: "gps",
    });
  });
});

describe("coarseCoordinates — audit payloads stay imprecise", () => {
  it("rounds to ~1 km grid", () => {
    expect(coarseCoordinates(28.6139, 77.209)).toBe("28.61,77.21");
  });
});

describe("audit allowlist covers location events", () => {
  it("accepts location.shared and location.viewed", () => {
    expect(AUDIT_ACTIONS.has("location.shared")).toBe(true);
    expect(AUDIT_ACTIONS.has("location.viewed")).toBe(true);
    const event = buildAuditEvent({
      actorId: "user-1",
      action: "location.shared",
      entity: "case",
      entityId: "case-1",
      caseId: "case-1",
      payload: { approx: "28.61,77.21", accuracyM: 12, source: "gps" },
    });
    expect(event).not.toBeNull();
    expect(event?.action).toBe("location.shared");
  });
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/authOptions", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth";
import { POST as postLocation, GET as getLocation } from "../../app/api/cases/[caseId]/location/route";

const VALID_CASE_ID = "123e4567-e89b-42d3-a456-426614174000";

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/cases/x/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/cases/[caseId]/location — authorization order", () => {
  it("rejects unauthenticated requests with 401 (no DB touch)", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await postLocation(jsonRequest({ latitude: 28, longitude: 77 }), {
      params: { caseId: VALID_CASE_ID },
    });
    expect(res.status).toBe(401);
  });

  it("masks invalid case IDs as 404 (no oracle)", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await postLocation(jsonRequest({ latitude: 28, longitude: 77 }), {
      params: { caseId: "not-a-uuid" },
    });
    expect(res.status).toBe(404);
  });

  it("rejects invalid coordinates with 422 before any ownership check", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await postLocation(jsonRequest({ latitude: 999, longitude: 77 }), {
      params: { caseId: VALID_CASE_ID },
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/latitude/i);
  });

  it("rejects malformed JSON bodies with 400", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1" } } as never);
    const bad = new Request("http://localhost/api/cases/x/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{broken",
    });
    const res = await postLocation(bad, { params: { caseId: VALID_CASE_ID } });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/cases/[caseId]/location — authorization order", () => {
  it("rejects unauthenticated requests with 401", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await getLocation(new Request("http://localhost/api/cases/x/location"), {
      params: { caseId: VALID_CASE_ID },
    });
    expect(res.status).toBe(401);
  });

  it("masks invalid case IDs as 404", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "u1" } } as never);
    const res = await getLocation(new Request("http://localhost/api/cases/x/location"), {
      params: { caseId: "nope" },
    });
    expect(res.status).toBe(404);
  });
});
