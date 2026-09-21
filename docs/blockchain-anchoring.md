# Blockchain Evidence Anchoring

Tamper-evident integrity anchoring for forensic evidence in Cyber Sakhi.

## What this is

Every piece of evidence (uploaded email, report, attachment metadata) is hashed
into a deterministic **SHA-256 integrity digest** of its canonical JSON payload.
That digest — and **only** that digest — is written to the **Ethereum Sepolia
testnet** (or an in-process Hardhat network for local development).

This proves, at a given block timestamp, that the evidence payload existed in
exactly that form. Any later tampering changes the digest and fails verification.

## What this is NOT

- It does **not** store email contents, attachments, PII, passwords, or private
  keys anywhere on-chain.
- It does **not** encrypt evidence.
- It does **not** make evidence retrievable from the chain.
- Production **mainnet is intentionally not supported**; this is a development
  / demo capability.

## Architecture

```
Evidence (DB rows + attachment)                             Blockchain service
                            ┌──────────────────────────────┐
 canonical JSON ──────────▶ │ lib/blockchain/anchor.ts:     │
                            │  sha256Hex + stableStringify  │
 integrity digest ────────────────────────────────────────▶ │ submit tx         ─▶ Sepolia / Hardhat network
                            │  (a) data-carrier ETH tx      │
                            │  (b) EvidenceAnchor contract  │
                            │      anchorEvidence(id, hash) │
                            └──────────────────────────────┘
```

Two on-chain strategies are supported:

| Mode | When | What is stored |
| --- | --- | --- |
| **Data-carrier tx** | No contract address configured | Digest embedded in transaction calldata; digest visible in the tx receipt/chain explorer. |
| **Contract call** | `BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS` set | Digests recorded in the `EvidenceAnchor` contract mapping + event; always verifiable via `getAnchor`. |

Verification (`verifyAnchorOnChain`):

- **Contract mode** — reads the digest back from the contract and compares it
  with the app-computed digest of the current evidence payload.
- **Data-carrier mode** — evidences the stored tx hash on the chain and, when a
  contract address is later configured, optionally reads that too.

## Setup (Sepolia)

1. Get a Sepolia RPC URL and a funded wallet
   (testnet ETH only; faucets like Alchemy/Infura/QuickNode give free Sepolia ETH).
2. Copy `.env.example` to `.env.local` and set:

   ```
   BLOCKCHAIN_ANCHOR_ENABLED=true
   BLOCKCHAIN_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
   BLOCKCHAIN_PRIVATE_KEY=<your hex private key>
   BLOCKCHAIN_CHAIN_ID=11155111
   BLOCKCHAIN_NETWORK_NAME=Ethereum Sepolia
   BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS=<deployed address>   # optional
   ```

3. (Recommended) Deploy `EvidenceAnchor`:

   ```
   npm run chain:compile
   npm run chain:deploy:sepolia
   ```

   The deploy script prints the deployed contract address **and the deployment
   transaction hash**, writes a record to
   `blockchain/deployed/evidence-anchor-sepolia.json`, and **automatically
   updates `BLOCKCHAIN_ANCHOR_CONTRACT_ADDRESS` in `.env.local`** — but only
   after the deployment transaction is confirmed, and only on Sepolia.
   Unrelated `.env.local` values are never touched.

4. Restart the dev server. The locker page now reports the chain
   **connected** and anchors evidence for real.

If any required variable is missing or invalid, the app honestly reports the
blockchain anchor as **unavailable** — it never fabricates a transaction or a
tx hash.

## Local development without a real chain

```
npm run chain:deploy:local    # deploys to an ephemeral in-process network
```

All unit tests (`tests/blockchain/*`) use real crypto hashing and a mocked
`ethers` provider, so the entire anchor/verify logic is tested without touching
a network.

## The smart contract

`blockchain/contracts/EvidenceAnchor.sol` (Solidity 0.8.24):

- `anchorEvidence(bytes32 evidenceId, bytes32 digest)` — stores the digest +
  timestamp + submitter, emits `EvidenceAnchored`, and returns `true`. Rejects
  an empty digest.
- `getAnchor(bytes32 evidenceId)` — read-only integrity metadata.
- `isAnchored(bytes32 evidenceId)` — convenience check.

`evidenceId` is `keccak256` of the internal evidence UUID; the on-chain record
exposes **no** evidence content.

Compile / deploy tooling: Hardhat 2 (`blockchain/hardhat.config.ts`), with the
Sepolia network sourced from the same `BLOCKCHAIN_*` env vars. See `npm run
chain:*` scripts in `package.json`.

## Security notes

- `BLOCKCHAIN_PRIVATE_KEY` grants the ability to sign anchor transactions; it is
  read only server-side and **must never** be committed or exposed to the client.
- Anchoring a hash is not encryption; hashes of low-entropy data may be
  brute-forced, so the canonical payload includes nonces/timestamps where
  relevant.
- **Server-authoritative digest**: the client-supplied hash in the upload
  request is only a UI/transport hint. For records that store evidence bytes
  (encrypted content), the server recomputes SHA-256 from those exact stored
  bytes (`lib/evidenceDigest.ts`) and persists it in `metadata.integrityDigest`.
  Blockchain anchoring and on-chain verification always use that
  server-computed digest, so a forged client hash can never become the anchored
  digest. Content-less records (scan/forensics metadata hooks) have no bytes to
  hash and keep the legacy digest fallback.
- The contract is immutable after deploy; audits are required before any
  real-world use far beyond this proof-of-concept.
- Re-anchoring the same evidence id with an updated digest emits a new event;
  on-chain history is therefore never silently overwritten.

## Observing anchors

- Unauthenticated chain explorers only show the digest + timestamp — this is by
  design.
- The set of digests is anchored in our `blockchain_anchors` table; the locker
  UI shows the tx hash, chain, type (contract/data-carrier), and status for each
  anchored evidence item.