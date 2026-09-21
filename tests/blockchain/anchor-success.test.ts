import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

/**
 * Mocked success-path tests for the blockchain anchoring service.
 *
 * These tests exercise the FULL anchor / verify / getTransaction control flow
 * with a stubbed `ethers` provider + wallet + contract, so the success paths
 * (transaction confirmed, on-chain digest verified, tx view ok) are tested
 * without a live network. The mocking deliberately mirrors the real ethers v6
 * API surface used by lib/blockchain/anchor.ts and evidenceAnchorContract.ts.
 */

const ethersMock = vi.hoisted(() => {
  const state = {
    networkChainId: BigInt(11155111),
    nextTxHash: "0x" + "ab".repeat(32),
    sentTxs: [] as Array<Record<string, unknown>>,
    sendReceipt: { status: 1, hash: "0x" + "ab".repeat(32), blockNumber: 42 },
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
      ethersMock.sentTxs.push(tx);
      return {
        hash: ethersMock.nextTxHash,
        wait: async () => ethersMock.sendReceipt,
      };
    }
  }

  class FakeContract {
    constructor(_address: string, _abi: unknown, _runner: unknown) {
      /* no-op */
    }
    async anchorEvidence(_evidenceId: string, _digest: string, _overrides: unknown) {
      return {
        hash: ethersMock.nextTxHash,
        wait: async () => ethersMock.sendReceipt,
      };
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
  getTransaction,
  buildEvidenceAnchorPayload,
} from "../../lib/blockchain/anchor";
import { getSafeProviderMeta, resetAnchorConfig } from "../../lib/blockchain/provider";

const savedEnv = { ...process.env };

function configureEnv(opts: { contractAddress?: string } = {}) {
  process.env.BLOCKCHAIN_ANCHOR_ENABLED = "true";
  process.env.BLOCKCHAIN_RPC_URL = "https://sepolia.example.invalid";
  process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + "11".repeat(32);
  process.env.BLOCKCHAIN_CHAIN_ID = "11155111";
  process.env.BLOCKCHAIN_NETWORK_NAME = "Sepolia (mocked)";
  if (opts.contractAddress) {
    process.env.BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS = opts.contractAddress;
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

function makeDigest() {
  const { payload, digest } = buildEvidenceAnchorPayload({
    evidenceCode: "EV-MOCK",
    sha256Hash: "a".repeat(64),
  });
  return { payload, digest };
}

beforeAll(() => clearEnv());
afterAll(() => {
  process.env = { ...savedEnv };
  resetAnchorConfig();
});

describe("anchorEvidenceOnChain — data-carrier success path", () => {
  it("submits a real tx shape and returns confirmed with a receipt-derived txHash", async () => {
    configureEnv();
    ethersMock.sentTxs = [];
    ethersMock.sendReceipt = { status: 1, hash: "0x" + "ab".repeat(32), blockNumber: 42 };
    try {
      const { payload, digest } = makeDigest();
      const result = await anchorEvidenceOnChain({
        scope: "evidence",
        evidenceId: "ev_mock_1",
        payload,
        digest,
      });

      expect(result.submitted).toBe(true);
      expect(result.status).toBe("confirmed");
      expect(result.txHash).toBe("0x" + "ab".repeat(32));
      expect(result.blockNumber).toBe(42);
      expect(result.chainId).toBe("11155111");
      expect(result.networkName).toBe("Sepolia (mocked)");
      expect(result.anchoredAt).toBeTruthy();

      // The transaction must carry exactly the digest as calldata
      // (data-carrier commitment, 0 ETH to self).
      expect(ethersMock.sentTxs).toHaveLength(1);
      const tx = ethersMock.sentTxs[0];
      expect(tx.data).toBe("0x" + digest.toLowerCase());
      expect(tx.to).toBe("0x" + "33".repeat(20));
    } finally {
      clearEnv();
    }
  }, 20000);

  it("returns failed when the receipt reports status != 0x1 (no fake confirmation)", async () => {
    configureEnv();
    ethersMock.sendReceipt = { status: 0, hash: "0x" + "ab".repeat(32), blockNumber: 42 };
    try {
      const { payload, digest } = makeDigest();
      const result = await anchorEvidenceOnChain({
        scope: "evidence",
        evidenceId: "ev_mock_1",
        payload,
        digest,
      });
      expect(result.submitted).toBe(true);
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("reverted");
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("anchorEvidenceOnChain — contract-mode success path", () => {
  it("writes through the EvidenceAnchor contract and returns confirmed", async () => {
    configureEnv({ contractAddress: "0x" + "44".repeat(20) });
    ethersMock.sentTxs = [];
    ethersMock.sendReceipt = { status: 1, hash: "0x" + "cd".repeat(32), blockNumber: 77 };
    try {
      const { payload, digest } = makeDigest();
      const result = await anchorEvidenceOnChain({
        scope: "evidence",
        evidenceId: "ev_mock_1",
        payload,
        digest,
      });

      expect(result.submitted).toBe(true);
      expect(result.status).toBe("confirmed");
      expect(result.txHash).toBe("0x" + "cd".repeat(32));
      expect(result.blockNumber).toBe(77);
      expect(result.chainId).toBe("11155111");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("does not use the contract path for non-evidence scopes (data-carrier instead)", async () => {
    configureEnv({ contractAddress: "0x" + "44".repeat(20) });
    ethersMock.sentTxs = [];
    ethersMock.sendReceipt = { status: 1, hash: "0x" + "ef".repeat(32), blockNumber: 8 };
    try {
      const { payload, digest } = makeDigest();
      const result = await anchorEvidenceOnChain({
        scope: "custody_chain",
        evidenceId: "ev_mock_1",
        payload,
        digest,
      });
      expect(result.status).toBe("confirmed");
      expect(ethersMock.sentTxs).toHaveLength(1);
      expect(ethersMock.sentTxs[0].data).toBe("0x" + digest.toLowerCase());
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("verifyAnchorOnChain — data-carrier success path", () => {
  it("reports verified when tx exists, calldata matches digest, and receipt status is 0x1", async () => {
    configureEnv();
    const { digest } = makeDigest();
    const txHash = "0x" + "12".repeat(32);
    ethersMock.transactions.set(txHash, { data: "0x" + digest.toLowerCase(), blockNumber: 123 });
    ethersMock.receipts.set(txHash, { status: 1 });
    try {
      const result = await verifyAnchorOnChain({
        record: { txHash, digest, chainId: "11155111" },
        currentDigest: digest,
      });
      expect(result.status).toBe("verified");
      expect(result.blockNumber).toBe(123);
      expect(result.txHash).toBe(txHash);
      expect(result.verifiedAt).toBeTruthy();
    } finally {
      clearEnv();
    }
  }, 20000);

  it("reports failed when the tx reverted (receipt status != 0x1)", async () => {
    configureEnv();
    const { digest } = makeDigest();
    const txHash = "0x" + "34".repeat(32);
    ethersMock.transactions.set(txHash, { data: "0x" + digest.toLowerCase(), blockNumber: 123 });
    ethersMock.receipts.set(txHash, { status: 0 });
    try {
      const result = await verifyAnchorOnChain({
        record: { txHash, digest, chainId: "11155111" },
        currentDigest: digest,
      });
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("reverted");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("reports not_found when the tx does not exist on-chain", async () => {
    configureEnv();
    const { digest } = makeDigest();
    const txHash = "0x" + "56".repeat(32);
    ethersMock.transactions.delete(txHash);
    try {
      const result = await verifyAnchorOnChain({
        record: { txHash, digest, chainId: "11155111" },
        currentDigest: digest,
      });
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("not found");
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("verifyAnchorOnChain — contract-mode success path", () => {
  it("reports verified when the on-chain stored digest matches and receipt is mined", async () => {
    configureEnv({ contractAddress: "0x" + "44".repeat(20) });
    const { digest } = makeDigest();
    const txHash = "0x" + "78".repeat(32);
    ethersMock.getAnchorReturn = ["0x" + digest.toLowerCase(), BigInt(12345), "0x" + "22".repeat(20)];
    ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 200 });
    ethersMock.receipts.set(txHash, { status: 1 });
    try {
      const result = await verifyAnchorOnChain({
        record: { txHash, digest, chainId: "11155111" },
        currentDigest: digest,
        evidenceId: "ev_mock_1",
      });
      expect(result.status).toBe("verified");
      expect(result.blockNumber).toBe(200);
    } finally {
      clearEnv();
    }
  }, 20000);

  it("reports digest_mismatch when the on-chain digest differs from current", async () => {
    configureEnv({ contractAddress: "0x" + "44".repeat(20) });
    const { digest } = makeDigest();
    const txHash = "0x" + "90".repeat(32);
    ethersMock.getAnchorReturn = ["0x" + "00".repeat(31) + "ff", BigInt(12345), "0x" + "22".repeat(20)];
    ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 200 });
    ethersMock.receipts.set(txHash, { status: 1 });
    try {
      const result = await verifyAnchorOnChain({
        record: { txHash, digest, chainId: "11155111" },
        currentDigest: digest,
        evidenceId: "ev_mock_1",
      });
      expect(result.status).toBe("digest_mismatch");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("reports failed when the contract has no anchor for this evidence id", async () => {
    configureEnv({ contractAddress: "0x" + "44".repeat(20) });
    const { digest } = makeDigest();
    const txHash = "0x" + "ab".repeat(32);
    ethersMock.getAnchorReturn = ["0x" + "00".repeat(32), BigInt(0), "0x" + "00".repeat(20)];
    try {
      const result = await verifyAnchorOnChain({
        record: { txHash, digest, chainId: "11155111" },
        currentDigest: digest,
        evidenceId: "ev_mock_1",
      });
      expect(result.status).toBe("failed");
      expect(result.reason).toContain("No anchor found on-chain");
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("getTransaction — safe transaction view", () => {
  it("returns ok with public metadata only", async () => {
    configureEnv();
    const txHash = "0x" + "cd".repeat(32);
    ethersMock.transactions.set(txHash, { data: "0x00", blockNumber: 555 });
    ethersMock.receipts.set(txHash, { status: 1 });
    try {
      const view = await getTransaction({ txHash });
      expect(view.status).toBe("ok");
      expect(view.blockNumber).toBe(555);
      expect(view.mined).toBe(true);
      expect(view.chainId).toBe("11155111");
      expect(view.networkName).toBe("Sepolia (mocked)");
      expect(JSON.stringify(view)).not.toContain("data");
    } finally {
      clearEnv();
    }
  }, 20000);

  it("returns not_found for a tx that does not exist", async () => {
    configureEnv();
    const txHash = "0x" + "ef".repeat(32);
    ethersMock.transactions.delete(txHash);
    try {
      const view = await getTransaction({ txHash });
      expect(view.status).toBe("not_found");
      expect(view.blockNumber).toBeNull();
      expect(view.mined).toBeNull();
    } finally {
      clearEnv();
    }
  }, 20000);
});

describe("provider meta exposes contractAddress safely", () => {
  it("getSafeProviderMeta includes contractAddress but never the private key", () => {
    configureEnv({ contractAddress: "0x" + "44".repeat(20) });
    try {
      const meta = getSafeProviderMeta();
      expect(meta.configured).toBe(true);
      expect(meta.contractAddress).toBe("0x" + "44".repeat(20));
      expect(meta).not.toHaveProperty("privateKey");
      expect(JSON.stringify(meta)).not.toContain("PRIVATE_KEY");
    } finally {
      clearEnv();
    }
  });

  it("getSafeProviderMeta has null contractAddress when not configured", () => {
    configureEnv();
    try {
      const meta = getSafeProviderMeta();
      expect(meta.contractAddress).toBeNull();
    } finally {
      clearEnv();
    }
  });
});