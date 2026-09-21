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
import type { AnchorSubmitResult, AnchorVerificationResult, TransactionView } from "./types";
import { getAnchorConfig, isAnchorConfigured, getSafeProviderMeta } from "./provider";
import { submitEvidenceAnchor, readEvidenceAnchor } from "./evidenceAnchorContract";
import { sanitizeBlockchainErrorMessage } from "./errorSanitizer";
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

/** Validate a 64-character lowercase hex SHA-256 digest. */
export function isValidHexDigest(digest: string | null | undefined): boolean {
  return typeof digest === "string" && /^[0-9a-f]{64}$/.test(digest);
}

/* ------------------------------------------------------------------ */
/* Payload construction                                               */
/* ------------------------------------------------------------------ */

/**
 * Build the descriptive payload string for an evidence anchor record and pass
 * through the canonical evidence digest as the commitment to anchor.
 *
 * The digest is NOT derived by re-hashing the payload: it is the canonical
 * evidence content digest (`sha256Hash`, see lib/evidenceDigest
 * `getCanonicalEvidenceDigest`). Anchor and verify both use that single
 * canonical digest function, so for unchanged evidence:
 *   localDigest === onChainDigest === verified.
 * The payload is a deterministic human-readable audit string stored in the
 * anchor record; it never influences the value committed on-chain.
 *
 * Payload format (human-readable):
 *   CYBERSAKHI:ANCHOR:v2:EVIDENCE:<evidenceCode>:<canonicalEvidenceDigest>
 *
 * DELIBERATELY EXCLUDED: the custody root. The custody chain is mutable
 * (append-only: every view/retrieval/anchor appends an event), so including it
 * in the committed digest made verification depend on live state and caused
 * "Digest mismatch" for unchanged evidence. Custody remains separately
 * integrity-checked via chain-of-custody verification.
 */
export function buildEvidenceAnchorPayload(input: {
  evidenceCode: string;
  sha256Hash: string;
}): { payload: string; digest: string } {
  const payload = [
    "CYBERSAKHI:ANCHOR:v2:EVIDENCE",
    input.evidenceCode,
    input.sha256Hash,
  ].join(":");
  return { payload, digest: input.sha256Hash };
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
  evidenceId?: string;
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

    // Contract mode: compare the on-chain stored digest for this evidence id
    // with the freshly recomputed digest.
    const useContract = Boolean(config.contractAddress) && Boolean(input.evidenceId);
    if (useContract) {
      let anchored: { digest: string } | null = null;
      try {
        anchored = await readEvidenceAnchor({
          contractAddress: config.contractAddress!,
          provider,
          evidenceId: input.evidenceId!,
        });
      } catch (err: unknown) {
        return {
          status: "unavailable",
          reason: isNetworkError(err)
            ? "Blockchain provider unreachable"
            : `Failed to read on-chain anchor: ${sanitizeBlockchainErrorMessage(err)}`,
        };
      }

      if (!anchored) {
        return {
          status: "failed",
          reason: "No anchor found on-chain for this evidence id",
        };
      }

      if (anchored.digest !== "0x" + currentDigest.toLowerCase()) {
        return {
          status: "digest_mismatch",
          reason: "On-chain digest differs from the current digest",
          txHash: record.txHash,
          blockNumber: null,
          chainId: String(network.chainId),
          networkName: config.networkName,
        };
      }

      // Strengthen the result with the original tx receipt when available.
      let blockNumber: number | null = null;
      let mined: boolean | null = null;
      if (record.txHash) {
        try {
          const tx = await provider.getTransaction(record.txHash);
          blockNumber = tx?.blockNumber ?? null;
          const receipt = await provider.getTransactionReceipt(record.txHash);
          mined = Number(receipt?.status) === 1;
        } catch {
          // Non-fatal: the on-chain digest comparison already succeeded.
        }
      }

      if (mined === false) {
        return {
          status: "failed",
          reason: "Transaction was mined but reverted (status != 0x1)",
          txHash: record.txHash,
          blockNumber,
          chainId: String(network.chainId),
          networkName: config.networkName,
        };
      }

      return {
        status: "verified",
        reason: undefined,
        txHash: record.txHash,
        blockNumber,
        chainId: String(network.chainId),
        networkName: config.networkName,
        verifiedAt: new Date().toISOString(),
      };
    }

    // Data-carrier mode (no contract): compare transaction calldata to digest.
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
      reason: isNetworkError(err)
        ? "Blockchain provider unreachable"
        : sanitizeBlockchainErrorMessage(err),
    };
  }
}

/**
 * Fetch safe, minimal information about an on-chain transaction.
 * Returns only public metadata — never calldata content, keys, or addresses.
 */
export async function getTransaction(input: { txHash: string }): Promise<TransactionView> {
  const config = getAnchorConfig();

  if (!isAnchorConfigured()) {
    return {
      txHash: input.txHash,
      status: "unavailable",
      blockNumber: null,
      mined: null,
      chainId: config.chainId,
      networkName: config.networkName,
      reason: "Blockchain provider is not configured",
    };
  }

  try {
    const provider = new JsonRpcProvider(config.rpcUrl!);
    const tx = await provider.getTransaction(input.txHash);
    if (!tx) {
      return {
        txHash: input.txHash,
        status: "not_found",
        blockNumber: null,
        mined: null,
        chainId: config.chainId,
        networkName: config.networkName,
        reason: "Transaction not found on chain",
      };
    }

    const receipt = await provider.getTransactionReceipt(input.txHash).catch(() => null);
    return {
      txHash: input.txHash,
      status: "ok",
      blockNumber: tx.blockNumber ?? null,
      mined: receipt ? Number(receipt.status) === 1 : null,
      chainId: config.chainId,
      networkName: config.networkName,
    };
  } catch (err: unknown) {
    return {
      txHash: input.txHash,
      status: "unavailable",
      blockNumber: null,
      mined: null,
      chainId: config.chainId,
      networkName: config.networkName,
      reason: isNetworkError(err)
        ? "Blockchain provider unreachable"
        : sanitizeBlockchainErrorMessage(err),
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

  // Input validation — never submit a malformed commitment.
  if (!isValidHexDigest(digest) || !payload || typeof payload !== "string") {
    return {
      submitted: false,
      status: "failed",
      txHash: null,
      blockNumber: null,
      chainId: null,
      networkName: null,
      anchoredAt: null,
      digest,
      payload,
      reason: "Invalid anchor input: digest must be a 64-character hex string and payload must be non-empty",
    };
  }

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

    // When a deployed EvidenceAnchor contract is configured for evidence
    // anchors, write through the contract (digest + timestamp + submitter +
    // event). Otherwise fall back to a data-carrier transaction (digest as
    // calldata). Both are real, verifiable on-chain commitments — the
    // contract path simply records structured integrity metadata.
    const useContract =
      scope === "evidence" &&
      Boolean(config.contractAddress) &&
      Boolean(evidenceId);

    const tx = useContract
      ? await submitEvidenceAnchor({
          contractAddress: config.contractAddress!,
          signer: wallet,
          evidenceId: evidenceId!,
          digest,
        })
      : await wallet.sendTransaction({
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
      : sanitizeBlockchainErrorMessage(err);
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
