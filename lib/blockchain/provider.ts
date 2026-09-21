/**
 * Server-only blockchain provider configuration.
 *
 * Reads from environment variables. Private keys never leave the server
 * and are never included in any API response.
 *
 * BLOCKCHAIN_ANCHOR_ENABLED = "true" | "false" (default false)
 * BLOCKCHAIN_RPC_URL        = JSON-RPC endpoint (Sepolia testnet in development)
 * BLOCKCHAIN_PRIVATE_KEY    = hex-encoded private key for signing anchors
 * BLOCKCHAIN_CHAIN_ID       = expected chain ID as a string (e.g. "11155111" for Sepolia)
 * BLOCKCHAIN_NETWORK_NAME   = human label for the chain (e.g. "Ethereum Sepolia")
 * BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS = optional deployed EvidenceAnchor contract
 *                                      address; when set, evidence anchors are
 *                                      written through the contract (hash +
 *                                      timestamp + submitter on-chain).
 */

import type { AnchorConfig, SafeProviderMeta } from "./types";

function envBool(value: string | undefined, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

let cachedConfig: AnchorConfig | null = null;

/**
 * Returns the raw anchor configuration.
 * The private key is included here for signing but never sent over the wire.
 */
export function getAnchorConfig(): AnchorConfig {
  if (cachedConfig) return cachedConfig;
  const enabled = envBool(process.env.BLOCKCHAIN_ANCHOR_ENABLED, false);
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL?.trim() || null;
  const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY?.trim() || null;
  const chainId = process.env.BLOCKCHAIN_CHAIN_ID?.trim() || null;
  const networkName = process.env.BLOCKCHAIN_NETWORK_NAME?.trim() || null;
  const contractAddress = process.env.BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS?.trim() || null;

  cachedConfig = { enabled, rpcUrl, privateKey, chainId, networkName, contractAddress };
  return cachedConfig;
}

/** Whether all required environment variables are present for a real anchor. */
export function isAnchorConfigured(): boolean {
  const c = getAnchorConfig();
  return Boolean(c.enabled && c.rpcUrl && c.privateKey && c.chainId);
}

/**
 * Clears the cached configuration so the next getAnchorConfig() call re-reads
 * process.env. Used by tests that mutate environment variables.
 */
export function resetAnchorConfig(): void {
  cachedConfig = null;
}

/** Safe provider metadata for API consumers (no secrets). */
export function getSafeProviderMeta(): SafeProviderMeta {
  const c = getAnchorConfig();
  return {
    provider: "evm",
    configured: isAnchorConfigured(),
    enabled: c.enabled,
    networkName: c.networkName,
    chainId: c.chainId,
    contractAddress: c.contractAddress,
  };
}
