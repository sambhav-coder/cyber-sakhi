import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";

import {
  sanitizeBlockchainErrorMessage,
  sanitizeSensitiveText,
} from "../../lib/blockchain/errorSanitizer";

/**
 * Mocked integration coverage: provider/network errors that embed the RPC URL
 * must be neutralized before they reach `reason` on anchor / verify /
 * transaction results. Mirrors the ethers mock pattern used by
 * tests/blockchain/anchor-success.test.ts.
 */

const ethersMock = vi.hoisted(() => {
  const state = {
    /** When set, every provider call throws an error with this message. */
    rpcError: null as string | null,
    networkChainId: BigInt(11155111),
    transactions: new Map<string, { data?: string; blockNumber: number | null }>(),
    receipts: new Map<string, { status: number }>(),
  };
  return state;
});

vi.mock("ethers", () => {
  class FakeJsonRpcProvider {
    constructor(_url?: unknown) {
      /* no-op */
    }
    async getNetwork() {
      if (ethersMock.rpcError) throw new Error(ethersMock.rpcError);
      return { chainId: ethersMock.networkChainId };
    }
    async getTransaction(hash: string) {
      if (ethersMock.rpcError) throw new Error(ethersMock.rpcError);
      return ethersMock.transactions.get(hash) ?? null;
    }
    async getTransactionReceipt(hash: string) {
      if (ethersMock.rpcError) throw new Error(ethersMock.rpcError);
      return ethersMock.receipts.get(hash) ?? null;
    }
  }
  class FakeWallet {
    address = "0x" + "33".repeat(20);
    constructor(_privateKey: string, _provider: unknown) {
      /* no-op */
    }
    async sendTransaction(_tx: Record<string, unknown>) {
      throw new Error("unreachable in these tests");
    }
  }
  class FakeContract {
    constructor() {
      /* no-op */
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
import { resetAnchorConfig } from "../../lib/blockchain/provider";

const savedEnv = { ...process.env };

const FAKE_RPC_URL = "https://sepolia.infura.io/v3/00001111222233334444555566667777";
// A DIFFERENT (literal) credential-bearing URL embedded by a provider error.
const LEAKED_URL = "https://alt.example.org/v3/aaaabbbbccccdddd";

function configureEnv() {
  process.env.BLOCKCHAIN_ANCHOR_ENABLED = "true";
  process.env.BLOCKCHAIN_RPC_URL = FAKE_RPC_URL;
  process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + "11".repeat(32);
  process.env.BLOCKCHAIN_CHAIN_ID = "11155111";
  process.env.BLOCKCHAIN_NETWORK_NAME = "Sepolia (mocked)";
  delete process.env.BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS;
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
    evidenceCode: "EV-SANITIZE",
    sha256Hash: "a".repeat(64),
  });
  return { payload, digest };
}

beforeAll(() => clearEnv());
afterAll(() => {
  process.env = { ...savedEnv };
  resetAnchorConfig();
});

/* ------------------------------------------------------------------ */
/* Pure sanitizer unit tests                                           */
/* ------------------------------------------------------------------ */

describe("sanitizeSensitiveText", () => {
  it("redacts the exact BLOCKCHAIN_RPC_URL value", () => {
    process.env.BLOCKCHAIN_RPC_URL = FAKE_RPC_URL;
    const result = sanitizeBlockchainErrorMessage(
      new Error(`Connection refused while reaching ${FAKE_RPC_URL} for evidence`)
    );
    delete process.env.BLOCKCHAIN_RPC_URL;

    expect(result).not.toContain(FAKE_RPC_URL);
    expect(result).not.toContain("00001111222233334444555566667777");
    expect(result).toContain("[REDACTED]");
    // Non-sensitive context is preserved.
    expect(result).toContain("Connection refused while reaching");
  });

  it("redacts the exact BLOCKCHAIN_PRIVATE_KEY value (with and without 0x)", () => {
    const key = "aa".repeat(32);
    process.env.BLOCKCHAIN_PRIVATE_KEY = "0x" + key;
    const message = `signer key 0x${key} (raw ${key}) rejected`;
    const result = sanitizeBlockchainErrorMessage(new Error(message));
    delete process.env.BLOCKCHAIN_PRIVATE_KEY;

    expect(result).not.toContain(key);
    expect(result).not.toContain("0x" + key);
  });

  it("redacts Infura-style /v3/<key> credential URLs while keeping the host", () => {
    const result = sanitizeBlockchainErrorMessage(
      new Error(`Upstream revert for ${LEAKED_URL} while fetching receipt`)
    );
    expect(result).not.toContain(LEAKED_URL);
    expect(result).not.toContain("aaaabbbbccccdddd");
    expect(result).toContain("alt.example.org");
    expect(result).toContain("[REDACTED]");
    expect(result).toContain("Upstream revert for");
  });

  it("redacts user:pass@ credentials inside URLs", () => {
    const result = sanitizeSensitiveText(
      "authenticating against https://user:hunter2secret@rpc.example.com/v1/endpoint"
    );
    expect(result).not.toContain("hunter2secret");
    expect(result).not.toContain("user:hunter2secret");
    expect(result).toContain("rpc.example.com");
    expect(result).toContain("[REDACTED_CREDS]");
  });

  it("redacts secret-bearing query params but keeps the param name", () => {
    const result = sanitizeSensitiveText(
      "Provider query failed: https://rpc.example.com/?api_key=xyz123abc&token=supersecret123"
    );
    expect(result).not.toContain("xyz123abc");
    expect(result).not.toContain("supersecret123");
    expect(result).toContain("api_key=[REDACTED]");
    expect(result).toContain("token=[REDACTED]");
  });

  it("redacts private-key-like 64-hex tokens", () => {
    const hex = "be".repeat(32);
    const result = sanitizeSensitiveText(`nonce collision for key ${hex}`);
    expect(result).not.toContain(hex);
    expect(result).toContain("[REDACTED_HEX]");
    expect(result).toContain("nonce collision for key");
  });

  it("keeps public 40-hex addresses and normal error text untouched", () => {
    const address = "0x" + "22".repeat(20);
    const result = sanitizeBlockchainErrorMessage(
      new Error(`Out of gas on contract ${address}`)
    );
    expect(result).toBe(`Out of gas on contract ${address}`);
  });

  it("passes normal non-sensitive messages through unchanged", () => {
    expect(
      sanitizeBlockchainErrorMessage(
        new Error("Transaction was mined but reverted (status != 0x1)")
      )
    ).toBe("Transaction was mined but reverted (status != 0x1)");
    expect(sanitizeBlockchainErrorMessage("insufficient funds for gas")).toBe(
      "insufficient funds for gas"
    );
  });

  it("handles strings, objects and empty inputs safely", () => {
    expect(sanitizeBlockchainErrorMessage("plain string error")).toBe(
      "plain string error"
    );
    expect(sanitizeBlockchainErrorMessage({ message: "obj error" })).toBe(
      "obj error"
    );
    expect(sanitizeBlockchainErrorMessage(undefined)).toBe("unknown error");
    expect(sanitizeBlockchainErrorMessage(new Error(""))).toBe("unknown error");
  });

  it("returns a non-empty fallback if a message is entirely sensitive", () => {
    const key = "cd".repeat(32);
    const result = sanitizeBlockchainErrorMessage(new Error(key));
    expect(result).not.toContain(key);
    expect(result.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* End-to-end: provider errors never leak through the service reasons  */
/* ------------------------------------------------------------------ */

describe("anchorEvidenceOnChain sanitizes provider errors", () => {
  it("reason never contains the leaked RPC URL or credentials", async () => {
    configureEnv();
    const { payload, digest } = makeDigest();
    ethersMock.rpcError = `revert: upstream ${LEAKED_URL} for evidence`;
    try {
      const result = await anchorEvidenceOnChain({
        scope: "evidence",
        evidenceId: "ev_sanitize_1",
        payload,
        digest,
      });
      expect(result.status).toBe("failed");
      expect(result.reason || "").not.toContain(LEAKED_URL);
      expect(result.reason || "").not.toContain("aaaabbbbccccdddd");
      expect(result.reason || "").toContain("alt.example.org");
      expect(result.reason || "").toContain("[REDACTED]");
    } finally {
      ethersMock.rpcError = null;
      clearEnv();
    }
  });
});

describe("verifyAnchorOnChain sanitizes provider errors", () => {
  it("reason never contains the leaked RPC URL or credentials", async () => {
    configureEnv();
    const { digest } = makeDigest();
    ethersMock.rpcError = `revert: upstream ${LEAKED_URL} for evidence`;
    try {
      const result = await verifyAnchorOnChain({
        record: {
          txHash: "0x" + "1".repeat(64),
          digest,
          chainId: "11155111",
        },
        currentDigest: digest,
        evidenceId: "ev_sanitize_1",
      });
      expect(result.status).toBe("unavailable");
      expect(result.reason || "").not.toContain(LEAKED_URL);
      expect(result.reason || "").not.toContain("aaaabbbbccccdddd");
      expect(result.reason || "").toContain("alt.example.org");
    } finally {
      ethersMock.rpcError = null;
      clearEnv();
    }
  });
});

describe("getTransaction sanitizes provider errors", () => {
  it("reason never contains the leaked RPC URL or credentials", async () => {
    configureEnv();
    ethersMock.rpcError = `lookup failed at ${LEAKED_URL}`;
    try {
      const result = await getTransaction({ txHash: "0x" + "1".repeat(64) });
      expect(result.status).toBe("unavailable");
      expect(result.reason || "").not.toContain(LEAKED_URL);
      expect(result.reason || "").not.toContain("aaaabbbbccccdddd");
      expect(result.reason || "").toContain("alt.example.org");
    } finally {
      ethersMock.rpcError = null;
      clearEnv();
    }
  });
});