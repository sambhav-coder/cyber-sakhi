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
 * 2. BLOCKCHAIN-ANCHOR (PROVIDER-READY / UNAVAILABLE): an optional external
 *    anchor registry would let an auditor verify that a given event hash was
 *    committed at a point in time. No registry is connected unless the admin
 *    sets EVIDENCE_ANCHOR_REGISTRY_URL. Until then the seam reports
 *    "unavailable" honestly — we never fake an external anchor.
 *
 * This file contains NO fake backends: a provider is either genuinely active
 * (local crypto) or explicitly unavailable with a setup note.
 */

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
  label: "Blockchain Anchor Registry",
  kind: "blockchain-anchor",
  status: "unavailable",
  note:
    "Set EVIDENCE_ANCHOR_REGISTRY_URL to connect a tamper-evident anchor registry.",
};

export function getEvidenceIntegrityProvider(): IntegrityProvider {
  // The ACTIVE integrity provider is the local SHA-256 chain — every custody
  // event is chained via previous_hash/event_hash and independently verifiable.
  return LOCAL_CRYPTO_PROVIDER;
}

export function getBlockchainAnchorStatus(): IntegrityProvider {
  // Blockchain anchoring is only reported available when an admin has
  // actually configured a registry AND a live commitment round succeeds.
  // Since no registry is configured in any current deployment, we expose it
  // as provider-ready but unavailable rather than claiming a fake anchor.
  if (process.env.EVIDENCE_ANCHOR_REGISTRY_URL) {
    return {
      ...BLOCKCHAIN_ANCHOR_PROVIDER,
      note:
        "Anchor registry URL is configured but no anchor service is connected. Verify the registry endpoint before enabling anchoring.",
    };
  }
  return BLOCKCHAIN_ANCHOR_PROVIDER;
}

export const evidenceIntegrityProviderLabel = LOCAL_CRYPTO_PROVIDER.label;