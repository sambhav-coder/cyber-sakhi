import "@nomicfoundation/hardhat-ethers";
import type { HardhatUserConfig } from "hardhat/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Load environment variables from the project `.env.local` (and only that
 * file) so Hardhat picks up BLOCKCHAIN_RPC_URL / BLOCKCHAIN_PRIVATE_KEY the
 * same way the app does. Existing shell/process environment takes precedence.
 * No values are ever logged here; secrets stay in-process and in the file.
 */
function loadEnvFile(file: string): void {
  try {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let value = m[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // .env.local missing/empty — proceed with the ambient environment.
  }
}

loadEnvFile(".env.local");

/**
 * Hardhat configuration for the EvidenceAnchor contract.
 *
 * Development network: Ethereum Sepolia testnet only. Mainnet is intentionally
 * not configured — this project must never anchor on a live production chain.
 *
 * Credentials come from the same environment variables used by the app
 * (see .env.example). Never hardcode or commit a private key; this file holds
 * no key material.
 */
const PRIVATE_KEY = process.env.BLOCKCHAIN_PRIVATE_KEY || "";
const hasPrivateKey =
  PRIVATE_KEY.startsWith("0x") || /^[0-9a-fA-F]{64}$/.test(PRIVATE_KEY);
const accounts = hasPrivateKey ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "paris",
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    hardhat: {},
    sepolia: {
      url:
        process.env.BLOCKCHAIN_RPC_URL ||
        "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts,
    },
  },
};

export default config;