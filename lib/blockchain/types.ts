/**
 * Blockchain anchor types.
 *
 * Only integrity digests and transaction metadata are ever stored or transmitted.
 * No evidence plaintext, passwords, or raw data-encryption keys leave the server.
 */

export type AnchorScope = "evidence" | "custody_chain" | "batch";

export type AnchorStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "unavailable"
  | "not_created"
  | "digest_mismatch";

/** Server-side anchor configuration (private key never exposed via API). */
export interface AnchorConfig {
  enabled: boolean;
  rpcUrl: string | null;
  /** Raw private key — server-only, never returned in any API response. */
  privateKey: string | null;
  chainId: string | null;
  networkName: string | null;
  /** Optional deployed EvidenceAnchor contract address (EVM). Public info. */
  contractAddress: string | null;
}

/** Safe representation returned to API consumers. */
export interface SafeProviderMeta {
  provider: "evm";
  configured: boolean;
  enabled: boolean;
  networkName: string | null;
  chainId: string | null;
  /** Deployed EvidenceAnchor contract address, if any (public info). */
  contractAddress: string | null;
}

export interface AnchorSubmitResult {
  submitted: boolean;
  status: AnchorStatus;
  txHash: string | null;
  blockNumber: number | null;
  chainId: string | null;
  networkName: string | null;
  anchoredAt: string | null;
  digest: string;
  payload: string;
  reason?: string;
}

export interface AnchorVerificationResult {
  status:
    | "verified"
    | "failed"
    | "unavailable"
    | "digest_mismatch"
    | "not_created";
  reason?: string;
  txHash?: string | null;
  blockNumber?: number | null;
  chainId?: string | null;
  networkName?: string | null;
  verifiedAt?: string | null;
}

/** Safe shape returned by GET anchor endpoint. */
export interface AnchorRecordView {
  id: string;
  anchorType: string;
  status: AnchorStatus;
  txHash: string | null;
  blockNumber: number | null;
  chainId: string | null;
  networkName: string | null;
  digest: string;
  anchoredAt: string | null;
  provider: string;
  anchorVersion: number;
  createdAt: string;
}

/**
 * Safe transaction view returned by the blockchain service's getTransaction().
 * Never includes private keys, wallet addresses, or calldata content.
 */
export interface TransactionView {
  txHash: string;
  status: "ok" | "not_found" | "unavailable";
  blockNumber: number | null;
  /** Whether the receipt shows a successful (status == 1) execution. */
  mined: boolean | null;
  chainId: string | null;
  networkName: string | null;
  reason?: string;
}

/** Result of a read-only contract anchor lookup (no secrets). */
export interface OnChainEvidenceAnchor {
  digest: string;
  timestamp: bigint;
  submitter: string;
}
