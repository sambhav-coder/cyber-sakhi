import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

/**
 * Anchor → verify integrity tests (the Evidence Locker "Verify Anchor" flow).
 *
 * Regression tests for the digest-mismatch bug: verification previously
 * recomputed the anchored digest from the MUTABLE custody chain (which grows on
 * every view/anchor), so unchanged evidence always reported a false
 * "Digest mismatch". The anchored digest is now the single canonical evidence
 * digest (getCanonicalEvidenceDigest) used by BOTH the anchor and verify
 * paths — a pure function of the stored evidence bytes.
 *
 * These tests exercise the full anchor → verify control flow with a stubbed
 * ethers provider/wallet/contract (mirroring the real ethers v6 API), and
 * assert the required invariants:
 *   1. anchor → verify unchanged evidence            = PASS
 *   2. anchor → verify same evidence/version         = PASS
 *   3. modified evidence → verify                    = FAIL
 *   4. wrong evidence ID → verify                    = FAIL
 *   5. wrong anchor record → verify                  = FAIL
 *   6. identical canonicalization between anchor/verify
 *
 * No real network, no real transactions, no secrets.
 */

const ethersMock = vi.hoisted(() => {
  const state = {
    networkChainId: BigInt(11155111),
    sendReceipt: { status: 1, hash: "0x" + "aa".repeat(32), blockNumber: 1234 },
    transactions: new Map<string, { data?: string; blockNumber: number | null }>(),
    receipts: new Map<string, { status: number }>(),
    getAnchorReturn: ["0x" + "11".repeat(32), BigInt(12345), "0x" + "22".repeat(20)],
  };
  return state;
});

vi.mock("ethers", () => {
  class FakeJsonRpcProvider {
    async getNetwork() {
      return { chainId: ethersMock.networkChainId };
    }
    async getTransaction(hash: string) {
      return ethersMock.transactions.get(hash) ?? null;
    }
    async getTransactionReceipt(hash: string) {
      return ethersMock.receipts.get(hash) ?? null;
    }
  }

  class FakeWallet {
    address = "0x" + "33".repeat(20);
    constructor(_privateKey: string, _provider: unknown) {
      /* no-op */
    }
    async sendTransaction(tx: Record<string, unknown>) {
      return { hash: ethersMock.sendReceipt.hash, wait: async () => ethersMock.sendReceipt };
    }
  }

  class FakeContract {
    constructor(_address: string, _abi: unknown, _runner: unknown) {
      /* no-op */
    }
    async anchorEvidence(_evidenceId: string, _digest: string, _overrides: unknown) {
      return { hash: ethersMock.sendReceipt.hash, wait: async () => ethersMock.sendReceipt };
    }
    async getAnchor(_evidenceId: string) {
      return ethersMock.getAnchorReturn;
    }
  }

  const id = (_value: string) => "0x" + "11".repeat(32);

  return { JsonRpcProvider: FakeJsonRpcProvider, Wallet: FakeWallet, Contract: FakeContract, id };
});

import {
  anchorEvidenceOnChain,
  verifyAnchorOnChain,
  buildEvidenceAnchorPayload,
} from "../../lib/blockchain/anchor";
import {
  getCanonicalEvidenceDigest,
  computeEvidenceContentDigest,
  EVIDENCE_DIGEST_META_KEY,
} from "../../lib/evidenceDigest";
import { getSafeProviderMeta, resetAnchorConfig } from "../../lib/blockchain/provider";

const savedEnv = { ...process.env };

function configureEnv(withContract: boolean) {
  process.env.BLOCKCHAIN_ANCHOR_ENABLED = "true";
  process.env.BLOCKCHAIN_RPC_URL = "https://sepolia.example.invalid";
  process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + "11".repeat(32);
  process.env.BLOCKCHAIN_CHAIN_ID = "11155111";
  process.env.BLOCKCHAIN_NETWORK_NAME = "Ethereum Sepolia";
  if (withContract) {
    process.env.BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS = "0x" + "44".repeat(20);
  } else {
    delete process.env.BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS;
  }
  resetAnchorConfig();
}

function clearEnv() {
  delete process.env.BLOCKCHAIN_ANCHOR_ENABLED;
  delete process.env.BLOCKCHAIN_RPC_URL;
  delete process.env.BLOCKCHAIN_PRIVATE_KEY;
  delete process.env.BLOCKCHAIN_CHAIN_ID;
  delete process.env.BLOCKCHAIN_NETWORK_NAME;
  delete process.env.BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS;
  resetAnchorConfig();
}

beforeAll(() => clearEnv());
afterAll(() => {
  process.env = { ...savedEnv };
  resetAnchorConfig();
});

/** Simulate the route-level anchor step: canonical digest → payload → on-chain tx. */
async function anchorViaRoute(evidenceId: string, evidenceRow: { encryptedContent: string | null }) {
  const canonical = getCanonicalEvidenceDigest(evidenceRow);
  const { payload } = buildEvidenceAnchorPayload({
    evidenceCode: "EV-INTEGRITY",
    sha256Hash: canonical,
  });
  const result = await anchorEvidenceOnChain({ scope: "evidence", evidenceId, payload, digest: canonical });
  return { canonical, payload, result };
}

describe("anchor → verify: unchanged evidence must pass (regression: false digest mismatch)", () => {
  it("PASS: anchor unreachable — unchanged evidence verifies as 'verified'", async () => {
    configureEnv(true);
    const evidenceId = "ev_integrity_unchanged";
    const evidenceRow = {
      encryptedContent: Buffer.from("the exact stored evidence bytes", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };

    try {
      const { canonical, result } = await anchorViaRoute(evidenceId, evidenceRow);
      expect(result.submitted).toBe(true);
      expect(result.status).toBe("confirmed");
      expect(canonical).toBe(computeEvidenceContentDigest(evidenceRow.encryptedContent));

      // On-chain anchor holds the canonical digest for THIS evidence id.
      ethersMock.getAnchorReturn = ["0x" + canonical.toLowerCase(), BigInt(12345), "0x" + "22".repeat(20)];
      const txHash = ethersMock.sendReceipt.hash;
      ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 1234 });
      ethersMock.receipts.set(txHash, { status: 1 });

      // Verify recomputes the SAME canonical digest from unchanged stored bytes.
      const currentDigest = getCanonicalEvidenceDigest(evidenceRow);
      expect(currentDigest).toBe(canonical);

      const verification = await verifyAnchorOnChain({
        record: { txHash, digest: canonical, chainId: "11155111" },
        currentDigest,
        evidenceId,
      });
      expect(verification.status).toBe("verified");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("PASS: same evidence/version verifies consistently across repeated verifies", async () => {
    configureEnv(true);
    const evidenceId = "ev_integrity_same_version";
    const evidenceRow = {
      encryptedContent: Buffer.from("same version content", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };

    try {
      const { canonical } = await anchorViaRoute(evidenceId, evidenceRow);
      ethersMock.getAnchorReturn = ["0x" + canonical.toLowerCase(), BigInt(12345), "0x" + "22".repeat(20)];
      const txHash = ethersMock.sendReceipt.hash;
      ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 1234 });
      ethersMock.receipts.set(txHash, { status: 1 });

      const record = { txHash, digest: canonical, chainId: "11155111" };
      const v1 = await verifyAnchorOnChain({
        record,
        currentDigest: getCanonicalEvidenceDigest(evidenceRow),
        evidenceId,
      });
      const v2 = await verifyAnchorOnChain({
        record,
        currentDigest: getCanonicalEvidenceDigest(evidenceRow),
        evidenceId,
      });
      expect(v1.status).toBe("verified");
      expect(v2.status).toBe("verified");
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("anchor → verify: modified / mismatched evidence must fail", () => {
  it("FAIL: evidence modified after anchoring (bytes changed) → digest_mismatch", async () => {
    configureEnv(true);
    const evidenceId = "ev_integrity_modified";
    const originalRow = {
      encryptedContent: Buffer.from("original artifact", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };
    const modifiedRow = {
      encryptedContent: Buffer.from("original artifact (tampered)", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };

    try {
      const { canonical } = await anchorViaRoute(evidenceId, originalRow);
      // The stored record keeps the ORIGINAL anchored digest, but the live
      // bytes have changed -> the recomputed canonical digest differs.
      const currentDigest = getCanonicalEvidenceDigest(modifiedRow);
      expect(currentDigest).not.toBe(canonical);

      const verification = await verifyAnchorOnChain({
        record: { txHash: "0x" + "bb".repeat(32), digest: canonical, chainId: "11155111" },
        currentDigest,
        evidenceId,
      });
      expect(verification.status).toBe("digest_mismatch");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("FAIL: on-chain digest for this evidence differs from the current digest → digest_mismatch", async () => {
    configureEnv(true);
    const evidenceId = "ev_integrity_onchain_differs";
    const evidenceRow = {
      encryptedContent: Buffer.from("current content", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };

    try {
      const { canonical } = await anchorViaRoute(evidenceId, evidenceRow);
      // The chain holds a DIFFERENT digest than the current canonical one.
      ethersMock.getAnchorReturn = ["0x" + "dd".repeat(32), BigInt(12345), "0x" + "22".repeat(20)];
      const txHash = ethersMock.sendReceipt.hash;
      ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 1234 });
      ethersMock.receipts.set(txHash, { status: 1 });

      const verification = await verifyAnchorOnChain({
        record: { txHash, digest: canonical, chainId: "11155111" },
        currentDigest: canonical,
        evidenceId,
      });
      expect(verification.status).toBe("digest_mismatch");
      expect(verification.reason).toContain("On-chain digest differs");
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("anchor → verify: wrong evidence id / wrong anchor record must fail", () => {
  it("FAIL: verifying a different evidence id finds no on-chain anchor (no cross-record verification)", async () => {
    configureEnv(true);
    const evidenceIdA = "ev_integrity_A";
    const evidenceRowA = {
      encryptedContent: Buffer.from("evidence A bytes", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };

    try {
      const { canonical } = await anchorViaRoute(evidenceIdA, evidenceRowA);
      // Contract has NO anchor for the (wrong) evidence id being verified.
      ethersMock.getAnchorReturn = ["0x" + "00".repeat(32), BigInt(0), "0x" + "00".repeat(20)];
      const txHash = ethersMock.sendReceipt.hash;
      ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 1234 });
      ethersMock.receipts.set(txHash, { status: 1 });

      const verification = await verifyAnchorOnChain({
        record: { txHash, digest: canonical, chainId: "11155111" },
        currentDigest: canonical,
        evidenceId: "ev_integrity_WRONG",
      });
      expect(verification.status).toBe("failed");
      expect(String(verification.reason)).toContain("No anchor found on-chain");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("FAIL: record digest belongs to a different anchor/evidence → digest_mismatch", async () => {
    configureEnv(true);
    const evidenceId = "ev_integrity_record";
    const evidenceRow = {
      encryptedContent: Buffer.from("this evidence's bytes", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };

    try {
      const { canonical } = await anchorViaRoute(evidenceId, evidenceRow);
      // A stale/wrong anchor record whose digest came from a DIFFERENT artifact.
      const otherDigest = "0".repeat(64);
      expect(otherDigest).not.toBe(canonical);

      const verification = await verifyAnchorOnChain({
        record: { txHash: "0x" + "cc".repeat(32), digest: otherDigest, chainId: "11155111" },
        currentDigest: canonical,
        evidenceId,
      });
      expect(verification.status).toBe("digest_mismatch");
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("identical canonicalization between anchor and verify", () => {
  it("the digest anchored and the digest verified are byte-identical for the same evidence", async () => {
    const evidenceRow = {
      encryptedContent: Buffer.from("canonicalization equivalence payload", "utf8").toString("base64"),
      sha256: "0".repeat(64),
      metadata: { [EVIDENCE_DIGEST_META_KEY]: "f".repeat(64) } as Record<string, unknown>,
    };

    // Anchor path digest:
    const anchorDigest = getCanonicalEvidenceDigest(evidenceRow);
    // Verify path digest (fresh recomputation from the same stored bytes):
    const verifyDigest = getCanonicalEvidenceDigest(evidenceRow);
    expect(anchorDigest).toBe(verifyDigest);
    expect(anchorDigest).toBe(computeEvidenceContentDigest(evidenceRow.encryptedContent));
    // The payload builder must pass the SAME canonical digest through:
    const { payload, digest } = buildEvidenceAnchorPayload({
      evidenceCode: "EV-CANON",
      sha256Hash: anchorDigest,
    });
    expect(digest).toBe(anchorDigest);
    expect(payload).toContain(anchorDigest);
  });

  it("the anchored digest is a pure function of the canonical bytes (custody-chain state cannot change it)", async () => {
    const evidenceRow = {
      encryptedContent: Buffer.from("custody-independent commitment", "utf8").toString("base64"),
      sha256: null,
      metadata: null as Record<string, unknown> | null,
    };
    const d1 = getCanonicalEvidenceDigest(evidenceRow);
    const d2 = getCanonicalEvidenceDigest({ ...evidenceRow, metadata: { something: "unrelated" } });
    const d3 = getCanonicalEvidenceDigest({
      encryptedContent: evidenceRow.encryptedContent,
      sha256: "different-legacy-column",
      metadata: { [EVIDENCE_DIGEST_META_KEY]: "stale-meta-digest" },
    });
    expect(d1).toBe(d2);
    expect(d1).toBe(d3);
  });
});

describe("provider meta exposure (no secrets in the verify/verify card)", () => {
  it("getSafeProviderMeta exposes public contract address but never private key material", () => {
    configureEnv(true);
    try {
      const meta = getSafeProviderMeta();
      expect(meta.contractAddress).toBe("0x" + "44".repeat(20));
      expect(meta.networkName).toBe("Ethereum Sepolia");
      expect(meta.chainId).toBe("11155111");
      expect(JSON.stringify(meta)).not.toContain("PRIVATE_KEY");
      expect(meta).not.toHaveProperty("privateKey");
    } finally {
      clearEnv();
    }
  }, 20000);
});