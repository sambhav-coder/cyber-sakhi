import hre from "hardhat";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const { ethers } = hre;

const SEPOLIA_CHAIN_ID = "11155111"; // Ethereum Sepolia testnet
const HARDHAT_LOCAL_CHAIN_ID = "31337"; // in-process hardhat network (offline dev only)

/**
 * Update a single KEY=VALUE line in a .env file, preserving every other line
 * and comment exactly as-is. Appends the key when it is not present.
 * Used ONLY to store the deployed contract address — never secrets.
 */
function upsertEnvValue(envPath: string, key: string, value: string): void {
  let content: string;
  try {
    content = readFileSync(envPath, "utf8");
  } catch {
    // .env.local does not exist yet — create it with the key.
    writeFileSync(envPath, `${key}=${value}\n`, { flag: "wx" });
    return;
  }

  const lineRegex = new RegExp(`^(\\s*)(${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(\\s*=\\s*).*$`);
  let found = false;

  // Drop the empty element produced by a trailing newline (if any).
  const lines = content.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  const updated = lines.map((line) => {
    const m = line.match(lineRegex);
    if (m) {
      found = true;
      return `${m[1]}${m[2]}${m[3]}${value}`;
    }
    return line;
  });
  if (!found) updated.push(`${key}=${value}`);

  writeFileSync(envPath, updated.join("\n") + "\n", "utf8");
}

/**
 * Deploy the EvidenceAnchor contract.
 *
 * Usage (from repository root):
 *   npm run chain:deploy:sepolia     # real Sepolia deployment (auto-saves address)
 *   npm run chain:deploy:local       # offline, ephemeral in-process hardhat network
 *
 * Reads BLOCKCHAIN_RPC_URL, BLOCKCHAIN_PRIVATE_KEY, BLOCKCHAIN_CHAIN_ID and
 * BLOCKCHAIN_NETWORK_NAME from the environment. The private key NEVER leaves
 * the Hardhat runtime and is NEVER printed.
 *
 * Safety: refuses to run on Ethereum Mainnet or on any chain that does not
 * match the intended network. On Sepolia the deployed contract address is
 * written back to .env.local as BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS, and ONLY
 * after a confirmed deployment. Unrelated .env.local values are untouched.
 */
async function main() {
  const networkName = hre.network.name;
  const liveChainId = (await ethers.provider.getNetwork()).chainId.toString();

  console.log(`Preparing deployment on "${networkName}" (live chainId ${liveChainId})`);

  const allowedChains: Record<string, boolean> = {
    [SEPOLIA_CHAIN_ID]: true,
    [HARDHAT_LOCAL_CHAIN_ID]: true,
  };

  if (liveChainId === "1") {
    throw new Error(
      "REFUSING to deploy: connected chain is Ethereum MAINNET (1). " +
        "This project must never write to mainnet. Aborting."
    );
  }
  if (!allowedChains[liveChainId]) {
    throw new Error(
      `REFUSING to deploy: chain ${liveChainId} is not an allowed deployment target ` +
        `(expected Sepolia ${SEPOLIA_CHAIN_ID} or local hardhat ${HARDHAT_LOCAL_CHAIN_ID}). Aborting.`
    );
  }
  if (networkName === "sepolia" && liveChainId !== SEPOLIA_CHAIN_ID) {
    throw new Error(
      `REFUSING to deploy: requested "sepolia" but the RPC reports chain ${liveChainId}. Aborting.`
    );
  }

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer address: ${deployer.address}`);

  const factory = await ethers.getContractFactory("EvidenceAnchor");
  const contract = await factory.deploy();

  // Wait for deployment confirmation (at least one mined block).
  await contract.waitForDeployment();
  const deploymentTx = contract.deploymentTransaction();
  let txHash: string | null = null;
  if (deploymentTx) {
    txHash = deploymentTx.hash;
    await deploymentTx.wait(); // receipt on first confirmation
  }

  const address = await contract.getAddress();
  console.log(`EvidenceAnchor deployed to ${address}`);
  console.log(`Deployment transaction hash: ${txHash ?? "n/a"}`);

  const outDir = join(process.cwd(), "blockchain", "deployed");
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, `evidence-anchor-${networkName}.json`);
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        network: networkName,
        chainId: liveChainId,
        address,
        deployTxHash: txHash,
        deployedAt: new Date().toISOString(),
        warning:
          "EvidenceAnchor stores integrity digests only, never forensic evidence content.",
      },
      null,
      2
    ) + "\n"
  );
  console.log(`Address record written to ${outFile}`);

  if (networkName === "sepolia") {
    const envPath = join(process.cwd(), ".env.local");
    upsertEnvValue(envPath, "BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS", address);
    console.log(
      `BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS=${address} written to .env.local (unrelated values untouched).`
    );
  } else {
    console.log(
      `(Not writing to .env.local on "${networkName}" — only Sepolia deployments auto-save the address.)`
    );
  }

  console.log("Deployment complete.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});