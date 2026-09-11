/**
 * Server-only blockchain anchoring service.
 *
 * - Deterministic payload/digest construction for evidence anchoring
 * - Real EVM transaction submission (data-carrier: tx to self with digest as calldata)
 * - Honest status reporting: unavailable/not_configured when env is absent
 * - Dry-run support: returns payload+digest without submitting any transaction
 * - Digest verification against on-chain receipt (status==0x1 + input data match)
 * - Batch anchoring via Merkle root
 *
 * Security invariants:
 * - No plaintext evidence, passwords, or raw keys are ever written on-chain
 * - No fabricated transactions: an anchor record is only created after a real tx
 *   with status 0x1 is confirmed by the RPC provider
 * - Private keys never leave the server; this file is never imported by client code
 */

import { createHash, randomBytes } from "crypto";
import { Wallet, JsonRpcProvider } from "ethers";
import type { AnchorSubmitResult, AnchorVerificationResult } from "./types";
import { getAnchorConfig, isAnchorConfigured, getSafeProviderMeta } from "./provider";
export { getSafeProviderMeta };

/* ------------------------------------------------------------------ */
/* Hashing helpers (server-only, deterministic via node:crypto)       */
/* ------------------------------------------------------------------ */

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Canonical stable JSON (sorted keys, no whitespace) — deterministic digest source. */
export function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(null);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Record<string, unknown>)[k])).join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

/** Hex-encode a Uint8Array. */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ------------------------------------------------------------------ */
/* Payload construction                                               */
/* ------------------------------------------------------------------ */

/**
 * Build a deterministic payload string and its digest for evidence anchoring.
 *
 * Payload format (human-readable):
 *   CYBERSAKHI:ANCHOR:v1:EVIDENCE:<evidenceCode>:<sha256>:<custodyRoot>
 *
 * Digest: SHA-256 of the payload (hex-encoded).
 */
export function buildEvidenceAnchorPayload(input: {
  evidenceId: string;
  evidenceCode: string;
  sha256Hash: string;
  custodyRootHash: string;
}): { payload: string; digest: string } {
  const payload = [
    "CYBERSAKHI:ANCHOR:v1:EVIDENCE",
    input.evidenceCode,
    input.sha256Hash,
    input.custodyRootHash,
  ].join(":");
  return { payload, digest: sha256Hex(payload) };
}

/**
 * Build a batch anchor payload over multiple evidence digests using a Merkle root.
 * The root is the binary Merkle root of SHA-256 hashes of each evidence digest.
 */
export function buildBatchAnchorPayload(input: {
  evidenceIds: string[];
  evidenceDigests: string[];
  batchSize: number;
}): { payload: string; digest: string; merkleRoot: string } {
  const leafHashes = input.evidenceDigests.map((d) => sha256Hex(d));
  const merkleRoot = computeMerkleRoot(leafHashes);

  const payload = stableStringify({
    version: "v1",
    type: "CYBERSAKHI:BATCH:ANCHOR",
    merkleRoot,
    leafCount: input.evidenceIds.length,
  });

  return { payload, digest: sha256Hex(payload), merkleRoot };
}

/**
 * Build an anchor payload for a custody-chain root of a single evidence item.
 * This allows anchoring the full custody history in one transaction.
 */
export function buildCustodyChainPayload(input: {
  evidenceId: string;
  custodyRootHash: string;
}): { payload: string; digest: string } {
  const payload = stableStringify({
    version: "v1",
    type: "CYBERSAKHI:CUSTODY_CHAIN",
    evidenceId: input.evidenceId,
    custodyRoot: input.custodyRootHash,
  });
  return { payload, digest: sha256Hex(payload) };
}

/** Simple binary Merkle root over an array of hex-encoded leaf hashes. */
export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) return sha256Hex("EMPTY_TREE");
  if (leafHashes.length === 1) return leafHashes[0];

  let level = leafHashes.map((h) => h);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0];
}

/* ------------------------------------------------------------------ */
/* Chain verification                                                 */
/* ------------------------------------------------------------------ */

function isNetworkError(err: unknown): boolean {
  const msg = String((err as Error)?.message || err || "").toLowerCase();
  return (
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("network") ||
    msg.includes("enotfound") ||
    msg.includes("eai_again") ||
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("could not detect network")
  );
}

/** Verify an existing anchor record against the real chain. */
export async function verifyAnchorOnChain(input: {
  record: {
    txHash: string | null;
    digest: string | null;
    chainId: string | null;
  };
  currentDigest: string;
}): Promise<AnchorVerificationResult> {
  const { record, currentDigest } = input;

  if (!record.txHash) {
    return { status: "not_created" };
  }

  if (!record.digest || record.digest !== currentDigest) {
    return { status: "digest_mismatch", reason: "Digest changed after anchoring — evidence may have been tampered with" };
  }

  const config = getAnchorConfig();
  if (!isAnchorConfigured()) {
    return { status: "unavailable", reason: "Blockchain provider is not configured — cannot verify on-chain receipt" };
  }

  try {
    const provider = new JsonRpcProvider(config.rpcUrl!);
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 8000)),
    ]);

    if (record.chainId && String(network.chainId) !== record.chainId) {
      return {
        status: "failed",
        reason: `Chain ID mismatch: record says ${record.chainId}, provider reports ${network.chainId}`,
      };
    }

    const tx = await provider.getTransaction(record.txHash);
    if (!tx) {
      return { status: "failed", reason: "Transaction not found on chain" };
    }

    const inputHex = tx.data?.toLowerCase() || "";
    const expectedHex = "0x" + record.digest.toLowerCase();
    if (inputHex !== expectedHex) {
      return {
        status: "digest_mismatch",
        reason: "Transaction input does not match the current digest",
        txHash: record.txHash,
        blockNumber: tx.blockNumber ?? null,
        chainId: String(network.chainId),
        networkName: config.networkName,
      };
    }

    const receipt = await provider.getTransactionReceipt(record.txHash);
    const statusOk = Number(receipt?.status) === 1;

    return {
      status: statusOk ? "verified" : "failed",
      reason: statusOk
        ? undefined
        : "Transaction was mined but reverted (status != 0x1)",
      txHash: record.txHash,
      blockNumber: (receipt?.blockNumber ?? tx.blockNumber) ?? null,
      chainId: String(network.chainId),
      networkName: config.networkName,
      verifiedAt: statusOk ? new Date().toISOString() : undefined,
    };
  } catch (err: unknown) {
    return {
      status: "unavailable",
      reason: isNetworkError(err) ? "Blockchain provider unreachable" : String((err as Error)?.message || "verification failed"),
    };
  }
}

/* ------------------------------------------------------------------ */
/* EVM anchor submission                                              */
/* ------------------------------------------------------------------ */

/**
 * Submit an evidence anchor via a data-carrier transaction.
 *
 * The transaction sends 0 ETH to the wallet's own address with the
 * digest as calldata. This is the simplest real on-chain commitment
 * that any EVM-compatible chain supports without a custom contract.
 */
export async function anchorEvidenceOnChain(input: {
  scope: "evidence" | "custody_chain" | "batch";
  evidenceId?: string | null;
  payload: string;
  digest: string;
  dryRun?: boolean;
}): Promise<AnchorSubmitResult> {
  const { scope, evidenceId, payload, digest, dryRun } = input;

  if (dryRun) {
    return {
      submitted: false,
      status: "not_created",
      txHash: null,
      blockNumber: null,
      chainId: null,
      networkName: null,
      anchoredAt: null,
      digest,
      payload,
      reason: "dryRun requested — no transaction submitted",
    };
  }

  const config = getAnchorConfig();

  if (!config.enabled) {
    return {
      submitted: false,
      status: "unavailable",
      txHash: null,
      blockNumber: null,
      chainId: null,
      networkName: null,
      anchoredAt: null,
      digest,
      payload,
      reason: "Blockchain anchoring is not enabled (BLOCKCHAIN_ANCHOR_ENABLED is not 'true')",
    };
  }

  if (!isAnchorConfigured()) {
    return {
      submitted: false,
      status: "unavailable",
      txHash: null,
      blockNumber: null,
      chainId: null,
      networkName: null,
      anchoredAt: null,
      digest,
      payload,
      reason: "Blockchain provider is not fully configured (missing RPC URL, private key, or chain ID)",
    };
  }

  try {
    const provider = new JsonRpcProvider(config.rpcUrl!);
    const network = await Promise.race([
      provider.getNetwork(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
    ]);

    const configuredChainId = config.chainId!;
    if (String(network.chainId) !== configuredChainId) {
      return {
        submitted: false,
        status: "failed",
        txHash: null,
        blockNumber: null,
        chainId: String(network.chainId),
        networkName: config.networkName,
        anchoredAt: null,
        digest,
        payload,
        reason: `Chain ID mismatch: configured ${configuredChainId}, provider reports ${network.chainId}`,
      };
    }

    const wallet = new Wallet(config.privateKey!, provider);
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0,
      data: "0x" + digest,
      gasLimit: 60000,
    });

    const receipt = await tx.wait();

    if (!receipt) {
      return {
        submitted: false,
        status: "failed",
        txHash: tx.hash,
        blockNumber: null,
        chainId: String(network.chainId),
        networkName: config.networkName,
        anchoredAt: null,
        digest,
        payload,
        reason: "Transaction submitted but receipt not received",
      };
    }

    const statusOk = Number(receipt.status) === 1;

    return {
      submitted: true,
      status: statusOk ? "confirmed" : "failed",
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      chainId: String(network.chainId),
      networkName: config.networkName,
      anchoredAt: new Date().toISOString(),
      digest,
      payload,
      reason: statusOk ? undefined : "Transaction reverted on-chain (status != 0x1)",
    };
  } catch (err: unknown) {
    const reason = isNetworkError(err)
      ? "Blockchain provider unreachable — no transaction was created"
      : String((err as Error)?.message || "unknown error");
    return {
      submitted: false,
      status: isNetworkError(err) ? "unavailable" : "failed",
      txHash: null,
      blockNumber: null,
      chainId: config.chainId,
      networkName: config.networkName,
      anchoredAt: null,
      digest,
      payload,
      reason,
    };
  }
}

/* ------------------------------------------------------------------ */
/* Digest randomization (for tests that need unique nonces)           */
/* ------------------------------------------------------------------ */

/** Generate a random 32-byte hex nonce for test digests. */
export function randomDigest(): string {
  return toHex(randomBytes(32));
}
