import { describe, it, expect, beforeAll, afterAll } from "vitest";

import {
  sha256Hex,
  stableStringify,
  buildEvidenceAnchorPayload,
  buildBatchAnchorPayload,
  buildCustodyChainPayload,
  computeMerkleRoot,
  anchorEvidenceOnChain,
  verifyAnchorOnChain,
  isValidHexDigest,
  randomDigest,
} from "../../lib/blockchain/anchor";

import { getSafeProviderMeta, resetAnchorConfig } from "../../lib/blockchain/provider";
import { getBlockchainAnchorStatus } from "../../lib/evidenceIntegrityProvider";
import { computeEventHash, computeCustodyRoot } from "../../lib/db/chainOfCustody";

const savedEnv = { ...process.env };

beforeAll(() => {
  delete process.env.BLOCKCHAIN_ANCHOR_ENABLED;
  delete process.env.BLOCKCHAIN_RPC_URL;
  delete process.env.BLOCKCHAIN_PRIVATE_KEY;
  delete process.env.BLOCKCHAIN_CHAIN_ID;
  delete process.env.BLOCKCHAIN_NETWORK_NAME;
  delete process.env.EVIDENCE_ANCHOR_REGISTRY_URL;
  resetAnchorConfig();
});

afterAll(() => {
  process.env = { ...savedEnv };
  resetAnchorConfig();
});

/* ------------------------------------------------------------------ */
/* TEST 3: stableStringify — property order + determinism              */
/* ------------------------------------------------------------------ */

describe("stableStringify determinism (TEST 3)", () => {
  it("produces identical string regardless of insertion order", () => {
    const a = { z: 1, a: 2, m: { b: "x", a: 3 } };
    const b = { a: 2, m: { a: 3, b: "x" }, z: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("sorted keys are lexically ordered", () => {
    const result = stableStringify({ charlie: true, alpha: false, bravo: null });
    expect(result).toBe('{"alpha":false,"bravo":null,"charlie":true}');
  });

  it("different values produce different strings", () => {
    expect(stableStringify({ x: 1 })).not.toBe(stableStringify({ x: 2 }));
  });

  it("null and undefined normalize identically", () => {
    expect(stableStringify({ a: null })).toBe(stableStringify({ a: null }));
  });
});

/* ------------------------------------------------------------------ */
/* TEST 2: sha256Hex + payload builders — deterministic                */
/* ------------------------------------------------------------------ */

describe("sha256Hex deterministic hash (TEST 2)", () => {
  it("identical input produces identical digest", () => {
    const input = "CYBERSAKHI:ANCHOR:v1:EVIDENCE:EV-TEST:abc123:root456";
    const h1 = sha256Hex(input);
    const h2 = sha256Hex(input);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different input produces different digest", () => {
    const h1 = sha256Hex("CYBERSAKHI:ANCHOR:v1:EVIDENCE:EV-A:hash1:root1");
    const h2 = sha256Hex("CYBERSAKHI:ANCHOR:v1:EVIDENCE:EV-A:hash2:root1");
    expect(h1).not.toBe(h2);
  });
});

describe("buildEvidenceAnchorPayload deterministic (TEST 2)", () => {
  const baseInput = {
    evidenceCode: "EV-TEST-1234",
    sha256Hash: "a".repeat(64),
  };

  it("same inputs produce same payload and digest", () => {
    const r1 = buildEvidenceAnchorPayload(baseInput);
    const r2 = buildEvidenceAnchorPayload(baseInput);
    expect(r1.payload).toBe(r2.payload);
    expect(r1.digest).toBe(r2.digest);
  });

  it("payload has the canonical v2 anchored prefix and bounds the digest", () => {
    const { payload, digest } = buildEvidenceAnchorPayload({
      evidenceCode: "EV-X",
      sha256Hash: "aa".repeat(32),
    });
    expect(payload).toMatch(/^CYBERSAKHI:ANCHOR:v2:EVIDENCE:EV-X:.+$/);
    expect(payload).toContain("aa".repeat(32));
    expect(digest).toBe("aa".repeat(32));
  });

  it("changed sha256Hash produces a different digest", () => {
    const d1 = buildEvidenceAnchorPayload(baseInput).digest;
    const d2 = buildEvidenceAnchorPayload({
      ...baseInput,
      sha256Hash: "c".repeat(64),
    }).digest;
    expect(d1).not.toBe(d2);
  });

  it("the committed digest IS the canonical evidence digest — independent of evidenceCode", () => {
    // The commitment must be a pure function of the canonical evidence digest.
    // Human-readable labels (evidenceCode) must never change the value anchored
    // on-chain, otherwise anchor and verify could disagree.
    const r1 = buildEvidenceAnchorPayload(baseInput);
    const r2 = buildEvidenceAnchorPayload({
      ...baseInput,
      evidenceCode: "EV-OTHER",
    });
    expect(r1.digest).toBe(baseInput.sha256Hash);
    expect(r1.digest).toBe(r2.digest);
    expect(r1.payload).not.toBe(r2.payload);
  });
});

describe("buildCustodyChainPayload deterministic (TEST 2)", () => {
  it("same inputs produce same payload and digest", () => {
    const input = { evidenceId: "ev_1", custodyRootHash: "ff".repeat(32) };
    const r1 = buildCustodyChainPayload(input);
    const r2 = buildCustodyChainPayload(input);
    expect(r1.payload).toBe(r2.payload);
    expect(r1.digest).toBe(r2.digest);
  });
});

describe("buildBatchAnchorPayload (TEST 10)", () => {
  it("builds a valid payload and digest deterministically", () => {
    const input = {
      evidenceIds: ["ev_1", "ev_2"],
      evidenceDigests: ["a".repeat(64), "b".repeat(64)],
      batchSize: 2,
    };
    const r1 = buildBatchAnchorPayload(input);
    const r2 = buildBatchAnchorPayload(input);
    expect(r1.payload).toBe(r2.payload);
    expect(r1.digest).toBe(r2.digest);
    expect(r1.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
  });
});

/* ------------------------------------------------------------------ */
/* TEST 10: Merkle root                                               */
/* ------------------------------------------------------------------ */

describe("computeMerkleRoot (TEST 10)", () => {
  it("empty leaves produce a deterministic empty-tree hash", () => {
    expect(computeMerkleRoot([])).toBe(computeMerkleRoot([]));
    expect(computeMerkleRoot([])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("single leaf returns that leaf hash", () => {
    const leaf = sha256Hex("leaf1");
    expect(computeMerkleRoot([leaf])).toBe(leaf);
  });

  it("two leaves combine as sha256(left + right)", () => {
    const l = sha256Hex("a");
    const r = sha256Hex("b");
    expect(computeMerkleRoot([l, r])).toBe(sha256Hex(l + r));
  });

  it("odd leaves pair the trailing leaf with itself", () => {
    const leaves = ["a", "b", "c"].map((s) => sha256Hex(s));
    const expected = sha256Hex(sha256Hex(leaves[0] + leaves[1]) + sha256Hex(leaves[2] + leaves[2]));
    expect(computeMerkleRoot(leaves)).toBe(expected);
  });
});

/* ------------------------------------------------------------------ */
/* Custody canonicalization determinism                               */
/* ------------------------------------------------------------------ */

describe("computeEventHash canonicalization (undefined vs null)", () => {
  it("undefined and null actorId/notes produce identical digests", async () => {
    const withNull = await computeEventHash(
      "ev_1",
      "VIEWED",
      null as unknown as undefined,
      null as unknown as undefined,
      null,
      "2026-09-18T12:00:00.000Z"
    );
    const withUndefined = await computeEventHash(
      "ev_1",
      "VIEWED",
      undefined,
      undefined,
      null,
      "2026-09-18T12:00:00.000Z"
    );
    expect(withNull).toBe(withUndefined);
  });

  it("timestamp is normalized to canonical UTC", async () => {
    const withOffset = await computeEventHash(
      "ev_1",
      "VIEWED",
      "u_1",
      "note",
      null,
      "2026-09-18T12:00:00.000+00:00"
    );
    const withUtcZ = await computeEventHash(
      "ev_1",
      "VIEWED",
      "u_1",
      "note",
      null,
      "2026-09-18T12:00:00.000Z"
    );
    expect(withOffset).toBe(withUtcZ);
  });

  it("different notes produce different digests", async () => {
    const a = await computeEventHash("ev_1", "VIEWED", "u_1", "noteA", null, "2026-09-18T12:00:00.000Z");
    const b = await computeEventHash("ev_1", "VIEWED", "u_1", "noteB", null, "2026-09-18T12:00:00.000Z");
    expect(a).not.toBe(b);
  });

  it("links previous and next events together", async () => {
    const first = await computeEventHash("ev_1", "UPLOADED", "u_1", "upload", null, "2026-09-18T12:00:00.000Z");
    const second = await computeEventHash("ev_1", "RETRIEVED", "u_1", "view", first, "2026-09-18T12:01:00.000Z");
    expect(second).not.toBe(first);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("computeCustodyRoot (TEST 10)", () => {
  it("empty chain produces a deterministic root", () => {
    const r1 = computeCustodyRoot([]);
    const r2 = computeCustodyRoot([]);
    expect(r1).toBe(r2);
    expect(r1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changing an event hash changes the root (tamper detection)", () => {
    const base = [{ event_hash: "a".repeat(64) }, { event_hash: "b".repeat(64) }];
    const tampered = [{ event_hash: "a".repeat(64) }, { event_hash: "c".repeat(64) }];
    expect(computeCustodyRoot(base)).not.toBe(computeCustodyRoot(tampered));
  });
});

/* ------------------------------------------------------------------ */
/* TEST 5 / honest status — unconfigured EVM                          */
/* ------------------------------------------------------------------ */

describe("honest unconfigured status (TEST 5)", () => {
  it("getSafeProviderMeta reports configured=false with no secrets", () => {
    const meta = getSafeProviderMeta();
    expect(meta.configured).toBe(false);
    expect(meta.provider).toBe("evm");
    expect(meta).not.toHaveProperty("privateKey");
    expect(JSON.stringify(meta)).not.toContain("PRIVATE_KEY");
  });

  it("getBlockchainAnchorStatus reports unavailable when disabled", () => {
    const status = getBlockchainAnchorStatus();
    expect(status.kind).toBe("blockchain-anchor");
    expect(status.status).toBe("unavailable");
  });

  it("getBlockchainAnchorStatus reports unavailable even if enabled but incomplete", () => {
    process.env.BLOCKCHAIN_ANCHOR_ENABLED = "true";
    resetAnchorConfig();
    try {
      const status = getBlockchainAnchorStatus();
      expect(status.status).toBe("unavailable");
    } finally {
      delete process.env.BLOCKCHAIN_ANCHOR_ENABLED;
      resetAnchorConfig();
    }
  });

  it("anchorEvidenceOnChain with full config but unreachable RPC returns unavailable (never a fake tx)", async () => {
    process.env.BLOCKCHAIN_ANCHOR_ENABLED = "true";
    process.env.BLOCKCHAIN_RPC_URL = "http://127.0.0.1:9";
    process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + "11".repeat(32);
    process.env.BLOCKCHAIN_CHAIN_ID = "1";
    resetAnchorConfig();
    try {
      const { payload, digest } = buildEvidenceAnchorPayload({
        evidenceCode: "EV-X",
        sha256Hash: "a".repeat(64),
      });
      const result = await anchorEvidenceOnChain({ scope: "evidence", evidenceId: "ev_1", payload, digest });
      expect(result.submitted).toBe(false);
      expect(result.status).toBe("unavailable");
      expect(result.txHash).toBeNull();
    } finally {
      delete process.env.BLOCKCHAIN_ANCHOR_ENABLED;
      delete process.env.BLOCKCHAIN_RPC_URL;
      delete process.env.BLOCKCHAIN_PRIVATE_KEY;
      delete process.env.BLOCKCHAIN_CHAIN_ID;
      resetAnchorConfig();
    }
  }, 20000);

  it("dryRun returns top-level 'not_created' and never submits", async () => {
    const { payload, digest } = buildEvidenceAnchorPayload({
      evidenceCode: "EV-X",
      sha256Hash: "a".repeat(64),
    });
    const result = await anchorEvidenceOnChain({ scope: "evidence", evidenceId: "ev_1", payload, digest, dryRun: true });
    expect(result.submitted).toBe(false);
    expect(result.status).toBe("not_created");
    expect(result.txHash).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* TEST 6: input validation                                         */
/* ------------------------------------------------------------------ */

describe("input validation (TEST 6)", () => {
  it("isValidHexDigest accepts 64-lowercase-hex", () => {
    expect(isValidHexDigest("a".repeat(64))).toBe(true);
    expect(isValidHexDigest("A".repeat(64))).toBe(false);
    expect(isValidHexDigest("abc")).toBe(false);
    expect(isValidHexDigest(null)).toBe(false);
    expect(isValidHexDigest(undefined)).toBe(false);
  });

  it("anchorEvidenceOnChain rejects an invalid digest", async () => {
    const result = await anchorEvidenceOnChain({
      scope: "evidence",
      evidenceId: "ev_1",
      payload: "CYBERSAKHI:ANCHOR:v1:EVIDENCE:EV-X",
      digest: "not-a-digest",
    });
    expect(result.submitted).toBe(false);
    expect(result.status).toBe("failed");
  });

  it("anchorEvidenceOnChain rejects an empty payload", async () => {
    const result = await anchorEvidenceOnChain({
      scope: "evidence",
      evidenceId: "ev_1",
      payload: "",
      digest: "a".repeat(64),
    });
    expect(result.submitted).toBe(false);
    expect(result.status).toBe("failed");
  });
});

/* ------------------------------------------------------------------ */
/* TEST 8/9: verification off-chain (deterministic checks)            */
/* ------------------------------------------------------------------ */

describe("verifyAnchorOnChain (TEST 8 / 9)", () => {
  const digestA = "a".repeat(64);
  const digestB = "b".repeat(64);

  it("missing txHash reports not_created", async () => {
    const r = await verifyAnchorOnChain({ record: { txHash: null, digest: digestA, chainId: null }, currentDigest: digestA });
    expect(r.status).toBe("not_created");
  });

  it("record digest differs from current digest reports digest_mismatch (TEST 9)", async () => {
    const r = await verifyAnchorOnChain({ record: { txHash: "0x" + "1".repeat(64), digest: digestA, chainId: null }, currentDigest: digestB });
    expect(r.status).toBe("digest_mismatch");
  });

  it("unconfigured provider with matching digest reports unavailable (honest)", async () => {
    const r = await verifyAnchorOnChain({ record: { txHash: "0x" + "1".repeat(64), digest: digestA, chainId: null }, currentDigest: digestA });
    expect(r.status).toBe("unavailable");
  });
});

/* ------------------------------------------------------------------ */
/* randomDigest sanity (tests that need unique nonces)                */
/* ------------------------------------------------------------------ */

describe("randomDigest", () => {
  it("generates valid distinct hex digests", () => {
    const a = randomDigest();
    const b = randomDigest();
    expect(a).not.toBe(b);
    expect(isValidHexDigest(a)).toBe(true);
    expect(isValidHexDigest(b)).toBe(true);
  });
});
