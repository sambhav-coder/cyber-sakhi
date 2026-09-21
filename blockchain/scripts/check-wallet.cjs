#!/usr/bin/env node
/**
 * Read-only Sepolia wallet check.
 *
 * Derives the PUBLIC address from BLOCKCHAIN_PRIVATE_KEY (stored locally in
 * .env.local) and queries the on-chain balance. Performs NO transactions,
 * writes NOTHING, and NEVER prints the private key or the RPC URL.
 *
 * Usage:
 *   npm run chain:check-wallet
 *
 * Exit codes:
 *   0  - check completed (may still report "missing key" or "no balance")
 *   2  - configuration error or wrong network (refuses to continue)
 */
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", "..", ".env.local");
const EXPECTED_CHAIN_ID = "11155111"; // Ethereum Sepolia

function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("request timed out")), 15000)),
  ]);
}

(async () => {
  let env;
  try {
    env = parseEnv(fs.readFileSync(ENV_PATH, "utf8"));
  } catch (e) {
    console.log(`ENV FILE: unreadable — ${e.message || "read error"}`);
    console.log("Expected at: " + ENV_PATH);
    process.exit(2);
  }

  const rpcUrl = (env.BLOCKCHAIN_RPC_URL || "").trim();
  const chainId = (env.BLOCKCHAIN_CHAIN_ID || "").trim();
  const networkName = (env.BLOCKCHAIN_NETWORK_NAME || "").trim();
  const privateKey = (env.BLOCKCHAIN_PRIVATE_KEY || "").trim();

  const keyHasContent = privateKey.length > 0;
  const keyFormatOk = /^(0x)?[0-9a-fA-F]{64}$/.test(privateKey) || /^0x[0-9a-fA-F]{64}$/.test(privateKey);

  // Presence report only — values of secrets are NEVER printed.
  console.log("Blockchain config presence:  PRESENT / (EMPTY) / MISSING");
  console.log("  BLOCKCHAIN_RPC_URL ........ " + (rpcUrl ? "PRESENT" : rpcUrl === "" && env.BLOCKCHAIN_RPC_URL !== undefined ? "(EMPTY)" : "MISSING"));
  console.log("  BLOCKCHAIN_CHAIN_ID ....... " + (chainId ? "PRESENT" : chainId === "" ? "(EMPTY)" : "MISSING"));
  console.log("  BLOCKCHAIN_NETWORK_NAME ... " + (networkName ? "PRESENT" : networkName === "" ? "(EMPTY)" : "MISSING"));
  console.log("  BLOCKCHAIN_PRIVATE_KEY .... " + (keyHasContent ? "PRESENT" : env.BLOCKCHAIN_PRIVATE_KEY !== undefined ? "(EMPTY)" : "MISSING"));
  if (keyHasContent) {
    console.log("  BLOCKCHAIN_PRIVATE_KEY format: " + (keyFormatOk ? "valid (64-hex)" : "INVALID — not a 64-character hex private key"));
  }
  console.log("");

  if (!rpcUrl) {
    console.log("RESULT: BLOCKCHAIN_RPC_URL missing — cannot reach the chain.");
    process.exit(2);
  }
  if (!keyHasContent) {
    console.log("RESULT: BLOCKCHAIN_PRIVATE_KEY missing — stopping before any deployment.");
    console.log("No transaction was sent. No deployment was attempted.");
    process.exit(0);
  }
  if (!keyFormatOk) {
    console.log("RESULT: BLOCKCHAIN_PRIVATE_KEY has an invalid format — cannot use it.");
    console.log("Fix the value in .env.local (64-hex, optionally 0x-prefixed) before any deployment.");
    process.exit(2);
  }

  const { Wallet, JsonRpcProvider, formatEther } = require("ethers");

  try {
    const provider = new JsonRpcProvider(rpcUrl);
    const network = await withTimeout(provider.getNetwork(), 15000);
    const liveChainId = network.chainId.toString();

    console.log("Live network chainId ....... " + liveChainId);
    if (liveChainId === "1") {
      console.log("RESULT: ABORTED — connected chain is ETHEREUM MAINNET. This setup must never use mainnet.");
      process.exit(2);
    }
    if (liveChainId !== EXPECTED_CHAIN_ID) {
      console.log(`RESULT: ABORTED — chain ${liveChainId} is NOT Sepolia (${EXPECTED_CHAIN_ID}).`);
      console.log("Check BLOCKCHAIN_RPC_URL / BLOCKCHAIN_CHAIN_ID in .env.local.");
      process.exit(2);
    }
    if (chainId && chainId !== EXPECTED_CHAIN_ID) {
      console.log(`WARNING: BLOCKCHAIN_CHAIN_ID in .env.local is "${chainId}" but the RPC reports ${EXPECTED_CHAIN_ID}.`);
    }

    const wallet = new Wallet(privateKey, provider);
    const address = wallet.address;
    const balance = await withTimeout(provider.getBalance(address), 15000);

    console.log("");
    console.log("Sepolia wallet address ..... " + address + "   (public, derived locally — key never shown)");
    console.log("Sepolia balance ........... " + formatEther(balance) + " ETH");

    if (balance === 0n) {
      console.log("");
      console.log("RESULT: Wallet is NOT funded — send testnet ETH via a Sepolia faucet before any deployment.");
    } else {
      console.log("");
      console.log("RESULT: Wallet is funded. Deployment is ready when you allow it.");
    }
    console.log("NOTE: read-only check — no transaction, no mutation, nothing written.");
  } catch (e) {
    console.log("RESULT: RPC ERROR — " + String((e && e.message) || e).slice(0, 400).split("\n")[0]);
    console.log("Check: is the RPC reachable and allowed (provider allowlist), and is BLOCKCHAIN_PRIVATE_KEY correct? Key is not printed.");
    process.exit(2);
  }
})().catch((e) => {
  console.log("RESULT: UNEXPECTED ERROR — " + String((e && e.message) || e).slice(0, 400));
  process.exit(2);
});