/**
 * Server-only EVM EvidenceAnchor contract client.
 *
 * The deployed contract (see blockchain/contracts/EvidenceAnchor.sol) stores
 * only integrity metadata — evidenceId -> { digest, timestamp, submitter } —
 * and emits an EvidenceAnchored event. No email contents, attachments, PII,
 * passwords, private keys, or sensitive forensic evidence are ever written
 * on-chain. This module is the single point of contact between the anchoring
 * service and the contract; it is never imported by client code.
 *
 * IMPORTANT: this is an integrity mechanism, NOT evidence storage.
 */

import { Contract, id } from "ethers";
import type {
  ContractRunner,
  Provider,
} from "ethers";
import type { OnChainEvidenceAnchor } from "./types";

/**
 * Minimal ABI used by the service. Keep in sync with
 * blockchain/contracts/EvidenceAnchor.sol:
 *
 *   function anchorEvidence(bytes32 evidenceId, bytes32 digest) external returns (bool)
 *   function getAnchor(bytes32 evidenceId) external view returns (bytes32, uint256, address)
 *   function isAnchored(bytes32 evidenceId) external view returns (bool)
 *   event EvidenceAnchored(bytes32 indexed evidenceId, bytes32 indexed digest, uint256 timestamp, address indexed submitter)
 */
export const EVIDENCE_ANCHOR_ABI = [
  "function anchorEvidence(bytes32 evidenceId, bytes32 digest) external returns (bool)",
  "function getAnchor(bytes32 evidenceId) external view returns (bytes32 digest, uint256 timestamp, address submitter)",
  "function isAnchored(bytes32 evidenceId) external view returns (bool)",
  "event EvidenceAnchored(bytes32 indexed evidenceId, bytes32 indexed digest, uint256 timestamp, address indexed submitter)",
];

/**
 * Deterministic bytes32 identifier for an evidence id string.
 * Uses keccak256(utf8(evidenceId)) — stable, non-reversible to content,
 * and works for UUID / ev_* style ids longer than 32 bytes.
 */
export function evidenceIdToBytes32(evidenceId: string): string {
  return id(evidenceId);
}

/**
 * Submit an anchor for an evidence item through the contract.
 * Returns the ethers transaction response (caller waits for the receipt).
 */
export async function submitEvidenceAnchor(input: {
  contractAddress: string;
  signer: ContractRunner;
  evidenceId: string;
  digest: string;
  gasLimit?: number;
  gasPrice?: bigint;
}): Promise<Awaited<ReturnType<Contract["anchorEvidence"]>>> {
  const contract = new Contract(input.contractAddress, EVIDENCE_ANCHOR_ABI, input.signer);
  const overrides: Record<string, unknown> = { gasLimit: input.gasLimit ?? 120000 };
  if (input.gasPrice !== undefined) overrides.gasPrice = input.gasPrice;
  return contract.anchorEvidence(
    evidenceIdToBytes32(input.evidenceId),
    "0x" + input.digest.toLowerCase(),
    overrides
  );
}

/**
 * Read the on-chain anchor for an evidence item (read-only, no gas).
 * Returns null when no anchor exists yet for that evidence id.
 */
export async function readEvidenceAnchor(input: {
  contractAddress: string;
  provider: Provider;
  evidenceId: string;
}): Promise<OnChainEvidenceAnchor | null> {
  const contract = new Contract(input.contractAddress, EVIDENCE_ANCHOR_ABI, input.provider);
  const raw: [string, bigint, string] = await contract.getAnchor(evidenceIdToBytes32(input.evidenceId));

  const zeroBytes32 = "0x" + "00".repeat(32);
  const digest = String(raw?.[0] || "").toLowerCase();
  if (!raw || digest === zeroBytes32) {
    return null;
  }

  return {
    digest,
    timestamp: raw[1],
    submitter: String(raw[2] || ""),
  };
}