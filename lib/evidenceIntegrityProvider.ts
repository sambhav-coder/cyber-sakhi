/**
 * Evidence Integrity Provider Architecture
 *
 * Honest provider layering for tamper-evident evidence anchoring:
 *
 * 1. LOCAL-CRYPTO (ACTIVE): every chain-of-custody event is hashed into an
 *    ordered SHA-256 chain (each event stores `previous_hash` + `event_hash`).
 *    Any tampering with an event breaks the chain and is detected by
 *    `verifyChainOfCustody`.
 *
 * 2. BLOCKCHAIN-ANCHOR (CONDITIONAL): a real EVM anchoring provider that
 *    commits evidence digests via data-carrier transactions. It reports
 *    "active" only when the server is actually configured with the required
 *    BLOCKCHAIN_* environment variables; otherwise it stays "unavailable"
 *    with a setup note. This honestly reflects the real provider — it never
 *    fakes an external anchor or claims on-chain commitment that did not
 *    happen.
 *
 * This file contains NO fake backends: a provider is either genuinely active
 * (local crypto) or explicitly unavailable with a setup note.
 */

import { getSafeProviderMeta } from "./blockchain/provider";

export type IntegrityProviderKind = "local-crypto" | "blockchain-anchor";
export type IntegrityProviderStatus = "active" | "unavailable";

export interface IntegrityProvider {
  key: string;
  label: string;
  kind: IntegrityProviderKind;
  status: IntegrityProviderStatus;
  note?: string;
}

export const LOCAL_CRYPTO_PROVIDER: IntegrityProvider = {
  key: "local-sha256-chain",
  label: "Local Crypto Chain (SHA-256 anchored)",
  kind: "local-crypto",
  status: "active",
  note: "Every custody event is chained via previous_hash/event_hash.",
};

export const BLOCKCHAIN_ANCHOR_PROVIDER: IntegrityProvider = {
  key: "blockchain-anchor",
  label: "Blockchain Anchor",
  kind: "blockchain-anchor",
  status: "unavailable",
  note:
    "Set BLOCKCHAIN_ANCHOR_ENABLED, BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY and BLOCKCHAIN_CHAIN_ID (server-side) to enable real EVM anchoring.",
};

export function getEvidenceIntegrityProvider(): IntegrityProvider {
  // The ACTIVE integrity provider is the local SHA-256 chain — every custody
  // event is chained via previous_hash/event_hash and independently verifiable.
  return LOCAL_CRYPTO_PROVIDER;
}

/**
 * Honest reflection of the real EVM anchor provider configuration.
 *
 * "active" only when all required BLOCKCHAIN_* env vars are present; otherwise
 * "unavailable" with a setup note. Never reports a fabricated anchor or claims
 * an on-chain commitment that did not actually happen.
 */
export function getBlockchainAnchorStatus(): IntegrityProvider {
  const meta = getSafeProviderMeta();

  if (!meta.enabled) {
    return {
      ...BLOCKCHAIN_ANCHOR_PROVIDER,
      note:
        "Blockchain anchoring is disabled — set BLOCKCHAIN_ANCHOR_ENABLED=true (server-side) to enable.",
    };
  }

  if (!meta.configured) {
    return {
      ...BLOCKCHAIN_ANCHOR_PROVIDER,
      note:
        "Blockchain anchoring is enabled but not fully configured — set BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY and BLOCKCHAIN_CHAIN_ID (server-side).",
    };
  }

  return {
    key: "blockchain-anchor",
    label: `Blockchain Anchor (${meta.networkName || "EVM"})`,
    kind: "blockchain-anchor",
    status: "active",
    note:
      "Real EVM anchoring is configured. Evidence digests are committed via data-carrier transactions.",
  };
}

export const evidenceIntegrityProviderLabel = LOCAL_CRYPTO_PROVIDER.label;