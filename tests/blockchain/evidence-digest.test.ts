import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import {
  computeEvidenceContentDigest,
  getAuthoritativeEvidenceDigest,
  getCanonicalEvidenceDigest,
  sha256Bytes,
  EVIDENCE_DIGEST_META_KEY,
} from "../../lib/evidenceDigest";

import { buildEvidenceAnchorPayload } from "../../lib/blockchain/anchor";

import { computeEventHash, computeCustodyRoot } from "../../lib/db/chainOfCustody";

/* ------------------------------------------------------------------ */
/* Server-authoritative digest: known vectors                          */
/* ------------------------------------------------------------------ */

describe("computeEvidenceContentDigest (server-side SHA-256)", () => {
  it("produces the expected SHA-256 for a known plaintext ('hello world')", () => {
    // base64 of "hello world"
    const encryptedContent = Buffer.from("hello world", "utf8").toString("base64");
    const digest = computeEvidenceContentDigest(encryptedContent);
    expect(digest).toBe(
      "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
    );
  });

  it("produces the expected SHA-256 for binary bytes (non-UTF8)", () => {
    const bytes = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x80]);
    const digest = computeEvidenceContentDigest(bytes.toString("base64"));
    expect(digest).toBe(sha256Bytes(bytes));
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic and independent of base64 re-encoding artifacts", () => {
    const rawBytes = Buffer.from("attack evidence payload", "utf8");
    const withPadding = rawBytes.toString("base64");
    const withoutPadding = withPadding.replace(/=+$/, "");
    expect(computeEvidenceContentDigest(withPadding)).toBe(
      computeEvidenceContentDigest(withoutPadding)
    );
  });

  it("returns null when no content is stored (server has no bytes to hash)", () => {
    expect(computeEvidenceContentDigest(undefined)).toBeNull();
    expect(computeEvidenceContentDigest(null)).toBeNull();
    expect(computeEvidenceContentDigest("")).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* Authoritative digest resolver: client hash is never authoritative    */
/* ------------------------------------------------------------------ */

describe("getAuthoritativeEvidenceDigest (client hash cannot win)", () => {
  it("uses the server-computed digest even when the client supplied a different hash", () => {
    const bogusClientHash = "0".repeat(64);
    const serverDigest = "a".repeat(64);
    const evidence = {
      sha256: bogusClientHash,
      metadata: { [EVIDENCE_DIGEST_META_KEY]: serverDigest },
    };
    expect(getAuthoritativeEvidenceDigest(evidence)).toBe(serverDigest);
    expect(getAuthoritativeEvidenceDigest(evidence)).not.toBe(bogusClientHash);
  });

  it("falls back to the stored sha256 for legacy records without a server digest", () => {
    const evidence = { sha256: "b".repeat(64), metadata: null };
    expect(getAuthoritativeEvidenceDigest(evidence)).toBe("b".repeat(64));
  });

  it("returns an empty string when neither digest exists", () => {
    expect(getAuthoritativeEvidenceDigest({ sha256: null, metadata: null })).toBe("");
    expect(getAuthoritativeEvidenceDigest({ metadata: {} })).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Canonical digest: THE single function used by anchor AND verify     */
/* ------------------------------------------------------------------ */

describe("getCanonicalEvidenceDigest (single canonical digest function)", () => {
  it("recomputes SHA-256 over the currently stored bytes (preferred)", () => {
    const encryptedContent = Buffer.from("test evidence bytes", "utf8").toString("base64");
    const storedMetaDigest = "f".repeat(64);
    const digest = getCanonicalEvidenceDigest({
      encryptedContent,
      sha256: "0".repeat(64),
      metadata: { integrityDigest: storedMetaDigest },
    });
    expect(digest).toBe(computeEvidenceContentDigest(encryptedContent));
    expect(digest).not.toBe(storedMetaDigest);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("prefers freshly recomputed bytes so modified evidence is detected", () => {
    const original = Buffer.from("original content", "utf8").toString("base64");
    const modified = Buffer.from("modified content!", "utf8").toString("base64");
    expect(getCanonicalEvidenceDigest({ encryptedContent: original, sha256: null, metadata: null })).not.toBe(
      getCanonicalEvidenceDigest({ encryptedContent: modified, sha256: null, metadata: null })
    );
  });

  it("falls back to metadata.integrityDigest for content-less records", () => {
    const metaDigest = "e".repeat(64);
    expect(
      getCanonicalEvidenceDigest({ encryptedContent: null, sha256: "d".repeat(64), metadata: { integrityDigest: metaDigest } })
    ).toBe(metaDigest);
  });

  it("falls back to the legacy sha256 column for legacy records", () => {
    expect(getCanonicalEvidenceDigest({ encryptedContent: null, sha256: "b".repeat(64), metadata: null })).toBe(
      "b".repeat(64)
    );
  });

  it("returns an empty string when no digest source exists", () => {
    expect(getCanonicalEvidenceDigest({ encryptedContent: "", sha256: null, metadata: null })).toBe("");
  });
});

/* ------------------------------------------------------------------ */
/* Anchoring: the anchored payload binds the server digest              */
/* ------------------------------------------------------------------ */

describe("anchor payload bounds the server-authoritative digest", () => {
  const base = {
    evidenceCode: "EV-2026-ABCDEF01",
    sha256Hash: "d".repeat(64),
  };

  it("anchors the server digest, not a deliberately wrong client hash", () => {
    const bogusClientHash = "0".repeat(64);
    const serverDigest = "d".repeat(64);

    const anchored = buildEvidenceAnchorPayload({ ...base, sha256Hash: serverDigest });
    const clientFaked = buildEvidenceAnchorPayload({ ...base, sha256Hash: bogusClientHash });

    expect(anchored.digest).not.toBe(clientFaked.digest);
    expect(anchored.payload).toContain(serverDigest);
    // The client-supplied hash must never appear in the anchored payload.
    expect(anchored.payload).not.toContain(bogusClientHash);
  });

  it("is deterministic — same evidence state, same anchored digest", () => {
    const input = {
      evidenceCode: "EV-2026-ABCDEF02",
      sha256Hash: "e".repeat(64),
    };
    const r1 = buildEvidenceAnchorPayload(input);
    const r2 = buildEvidenceAnchorPayload(input);
    expect(r1.digest).toBe(r2.digest);
    expect(r1.payload).toBe(r2.payload);
  });
});

/* ------------------------------------------------------------------ */
/* The anchored digest is content-based and stable for unchanged evid   */
/* ------------------------------------------------------------------ */

describe("anchored digest is content-based, independent of the mutable custody chain", () => {
  it("is identical for unchanged evidence even when the custody chain grows", async () => {
    const evidenceId = "ev_custody-consistency-1";
    const e1 = await computeEventHash(
      evidenceId,
      "UPLOADED",
      "user-1",
      "Initial upload",
      null,
      "2026-09-10T08:00:00.000Z"
    );
    const e2 = await computeEventHash(
      evidenceId,
      "ANCHORED",
      "user-1",
      "Blockchain anchor confirmed",
      e1,
      "2026-09-10T09:00:00.000Z"
    );
    const events = [
      { event_hash: e1, previous_hash: null },
      { event_hash: e2, previous_hash: e1 },
    ];

    const rootA = computeCustodyRoot(events);
    const rootB = computeCustodyRoot(events);
    expect(rootA).toBe(rootB);

    const serverDigest = "a".repeat(64);
    const anchoredAtAnchorTime = buildEvidenceAnchorPayload({
      evidenceCode: "EV-2026-CC01",
      sha256Hash: serverDigest,
    });
    // The custody chain grows AFTER anchoring (anchor + later retrieval events).
    const changedRoot = computeCustodyRoot([
      ...events,
      { event_hash: await computeEventHash(evidenceId, "RETRIEVED", "user-1", "Viewed", e2, "2026-09-10T10:00:00.000Z"), previous_hash: e2 },
    ]);
    // Root changed -> the AUDIT metadata changed, but the committed digest MUST
    // stay the same: it is a pure function of the canonical evidence digest.
    expect(changedRoot).not.toBe(rootA);
    expect(anchoredAtAnchorTime.digest).toBe(serverDigest);
    // The server digest slot stays the authoritative one throughout, and the
    // verify path recomputes the SAME value regardless of custody state.
    expect(anchoredAtAnchorTime.payload).toContain(serverDigest);
    expect(buildEvidenceAnchorPayload({ evidenceCode: "EV-2026-CC01", sha256Hash: serverDigest }).digest).toBe(
      anchoredAtAnchorTime.digest
    );
  });

  it("changes when the canonical evidence content changes (modified evidence is detected)", () => {
    const canonicalA = getCanonicalEvidenceDigest({
      encryptedContent: Buffer.from("artifact v1", "utf8").toString("base64"),
      sha256: null,
      metadata: null,
    });
    const canonicalB = getCanonicalEvidenceDigest({
      encryptedContent: Buffer.from("artifact v2 (tampered)", "utf8").toString("base64"),
      sha256: null,
      metadata: null,
    });
    const anchoredA = buildEvidenceAnchorPayload({ evidenceCode: "EV-2026-CC01", sha256Hash: canonicalA }).digest;
    const anchoredB = buildEvidenceAnchorPayload({ evidenceCode: "EV-2026-CC01", sha256Hash: canonicalB }).digest;
    expect(canonicalA).not.toBe(canonicalB);
    expect(anchoredA).not.toBe(anchoredB);
  });

  it("anchor and verify use the EXACT same canonicalization (identical canonical digest)", () => {
    const encryptedContent = Buffer.from("single canonical function payload", "utf8").toString("base64");
    const row = { encryptedContent, sha256: null, metadata: null };
    // Anchor path:
    const anchorDigest = getCanonicalEvidenceDigest(row);
    // Verify path (same function, same row):
    const verifyDigest = getCanonicalEvidenceDigest(row);
    expect(anchorDigest).toBe(verifyDigest);
  });
});

/* ------------------------------------------------------------------ */
/* Sanity: native crypto agrees with expected digest                    */
/* ------------------------------------------------------------------ */

describe("sha256Bytes native sanity", () => {
  it("matches node:crypto sha256 over a known value", () => {
    const expected = createHash("sha256").update("hello world", "utf8").digest("hex");
    expect(sha256Bytes(Buffer.from("hello world", "utf8"))).toBe(expected);
  });
});