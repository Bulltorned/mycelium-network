# Phase 2: Service Layer + Commercial Engine - Research

**Researched:** 2026-04-12
**Domain:** Off-chain infrastructure (Helius indexing, Irys/Arweave storage, BIP-44 wallets, PostgreSQL) + commercial engine (USDC licensing, royalty distribution, MCP completion)
**Confidence:** HIGH

## Summary

Phase 2 transforms Mycelium from a devnet prototype with mock implementations into a functioning commercial protocol. It has three distinct concerns: (1) off-chain infrastructure that makes on-chain data queryable, storable, and agent-addressable, (2) the commercial engine that enables USDC-denominated licensing and royalty distribution, and (3) MCP server completion that connects all 13 tools to live devnet programs.

The infrastructure layer is the foundation -- Helius webhooks push on-chain events to PostgreSQL, Irys uploads metadata to Arweave before registration, and BIP-44 HD derivation gives each agent its own keypair. The commercial engine builds on top -- Hypha live adapter creates/acquires/verifies licenses with USDC payment, Rhizome distributes royalties atomically. The MCP server ties it together by replacing all TODO/throw stubs with live implementations.

**Primary recommendation:** Build infrastructure first (PostgreSQL + Helius + Irys + key vault), then commercial engine (Hypha + Rhizome live adapters with USDC), then MCP completion. Infrastructure unblocks everything downstream. Do not attempt to implement licensing without the indexer -- license verification needs to query existing licenses, and getProgramAccounts won't scale.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INF-01 | Helius webhook integration receives and indexes all program events into PostgreSQL | Helius webhooks docs verified; enhanced transaction format includes decoded instruction data; webhook receiver pattern documented in ARCHITECTURE.md |
| INF-02 | Helius DAS API replaces getProgramAccounts for search/provenance | DAS API is NFT/token-focused; for custom Anchor PDAs, use webhooks+PostgreSQL as the query layer; DAS `searchAssets` insufficient for custom program accounts |
| INF-03 | Irys/Arweave upload pipeline -- upload before on-chain registration | @irys/upload-solana 0.1.8 verified; upload-before-register pattern documented; SOL payment, instant uploads, permanent URIs |
| INF-04 | BIP-44 HD wallet derivation per agent | ed25519-hd-key 1.3.0 + bip39 3.1.0 verified; derivation path m/44'/501'/{agentIndex}'/0' standard for Solana |
| INF-05 | PostgreSQL serves indexer mirror, key vault, similarity hash index | pg 8.20.0 available; no PostgreSQL server installed locally -- need cloud instance or local install |
| LIC-01 | IP owner can create license template with full terms | Hypha program already deployed with CreateLicenseTemplate instruction; live adapter currently throws "not implemented" |
| LIC-02 | Four license archetypes functional | LicenseType enum already exists in Hypha program (CreativeCommons, Commercial, Exclusive, AITraining) |
| LIC-03 | Licensee acquires license by paying USDC | Requires @solana/spl-token for createTransferCheckedInstruction; USDC uses 6 decimals; needs associated token account creation |
| LIC-04 | License verification returns licensed/not-licensed with details | Requires indexer (INF-01) or on-chain PDA lookup via Hypha program; PDA seeds: ["license", template, licensee] |
| LIC-05 | Hypha live adapter implements createLicense, acquireLicense, verifyLicense | Current live adapter has TODO stubs for all three; needs IDL client for Hypha (IDL already exists in src/idl/) |
| ROY-01 | Royalty splits for up to 8 recipients (basis points summing to 10,000) | Rhizome program already supports this via configure_royalty instruction; live adapter not implemented |
| ROY-02 | Deposit and distribution work with USDC (SPL token) | Rhizome currently SOL-only; needs anchor-spl token CPI for USDC transfers; devnet USDC mint required for testing |
| ROY-03 | Distribution is atomic -- single tx splits vault to all recipients | Rhizome distribute_royalties instruction exists but has unconstrained pool/wallet (fixed in Phase 1); atomic split is architectural requirement |
| ROY-04 | Comprehensive test suite for Rhizome | No tests/mycelium-rhizome.ts exists yet; test file needs creation from scratch |
| MCP-01 | All 13 MCP tools functional against live devnet | 6 tools work live (register, search, get, verify_provenance, check_similarity, get_wallet); 7 need live implementation |
| MCP-02 | Structured error responses for all failure paths | Pattern exists (isError: true content blocks); needs systematic audit across all tools |
| MCP-03 | Agent identity from env var or request context, not hardcoded | Currently defaults to "default-agent"; needs BIP-44 integration from INF-04 |
</phase_requirements>

## Standard Stack

### Core (already in project, add dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @coral-xyz/anchor | 0.30.1 | IDL client for all 4 programs | Must match deployed Anchor version; IDL JSONs already in src/idl/ |
| @solana/web3.js | ^1.98.0 | Solana RPC, transactions, keypairs | Anchor 0.30.x requires v1; do not upgrade to v2 |
| @solana/spl-token | 0.4.14 | USDC SPL token transfers | Required for LIC-03 (license acquisition) and ROY-02 (USDC royalties) |
| helius-sdk | 2.2.2 | Helius webhook management + DAS API | Typed wrappers reduce boilerplate; webhook creation/management |
| @irys/upload | latest | Core upload SDK (modular) | Replaces deprecated @irys/sdk monolith |
| @irys/upload-solana | 0.1.8 | Solana-specific Irys adapter (Node.js) | Server-side uploads paying with SOL |
| ed25519-hd-key | 1.3.0 | BIP-44 HD key derivation for Ed25519 | Standard Solana HD wallet derivation |
| bip39 | 3.1.0 | Mnemonic seed phrase handling | Generate/restore master seed from 24-word phrase |
| pg | 8.20.0 | PostgreSQL client for Node.js | Indexer writes, key vault storage, query API |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express | ^4.21 | HTTP server for webhook receiver | Helius webhooks need an HTTP POST endpoint |
| dotenv | ^16 | Environment variable loading | Already implicit in project; formalize for new env vars |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| pg (raw SQL) | Prisma ORM | Prisma adds build step + migration complexity; raw SQL is simpler for 5-6 tables with known schema |
| express | fastify | Fastify is faster but express is more widely known; webhook handler is not a bottleneck |
| PostgreSQL | SQLite | SQLite cannot handle concurrent webhook writes; PostgreSQL is required for production indexer |
| Helius DAS | Custom getProgramAccounts | DAS API doesn't support custom Anchor PDAs well; webhooks+Postgres is the correct pattern for custom programs |

**Installation (add to root package.json):**
```bash
npm install @solana/spl-token@0.4.14 helius-sdk @irys/upload @irys/upload-solana ed25519-hd-key bip39 pg express
npm install -D @types/pg @types/express
```

## Architecture Patterns

### Recommended Project Structure (additions for Phase 2)

```
src/
  index.ts                  # MCP server entry (existing)
  solana-adapter.ts         # Interface + mock (existing)
  solana-live-adapter.ts    # Live adapter (existing, extend)
  types.ts                  # Shared types (existing, extend)
  idl/                      # Anchor IDL JSONs (existing)
  services/
    indexer/
      webhook-handler.ts    # POST /webhooks/helius receiver
      event-parser.ts       # Transaction -> domain events
      queries.ts            # Search, browse, provenance SQL
    storage/
      irys-uploader.ts      # Irys SDK wrapper, upload + tags
      arweave-gateway.ts    # URI builder (arweave.net/{id})
    key-vault/
      hd-derive.ts          # BIP-44 derivation from master seed
      encrypted-store.ts    # AES-256-GCM encrypted key storage in PG
    db/
      pool.ts               # PostgreSQL connection pool (pg)
      schema.sql            # Table definitions (DDL)
      migrations/           # Schema versioning
```

### Pattern 1: Webhook-Driven Indexing

**What:** Helius pushes enhanced transactions to your HTTP endpoint. Parse instruction discriminators, extract account data, upsert to PostgreSQL. Never poll.

**When to use:** All on-chain event indexing.

**Example:**
```typescript
// Source: Helius Webhooks Documentation
// POST /webhooks/helius
app.post('/webhooks/helius', async (req, res) => {
  const events = req.body; // Array of enhanced transactions
  for (const tx of events) {
    if (await db.hasTransaction(tx.signature)) continue; // Idempotent
    for (const ix of tx.instructions) {
      const programId = ix.programId;
      if (programId === PROGRAM_IDS.spore.toString()) {
        await processSporeEvent(ix, tx.slot, tx.timestamp);
      } else if (programId === PROGRAM_IDS.hypha.toString()) {
        await processHyphaEvent(ix, tx.slot, tx.timestamp);
      }
      // ... rhizome, meridian
    }
    await db.markProcessed(tx.signature, tx.slot);
  }
  res.status(200).send('ok'); // Respond fast, Helius retries on timeout
});
```

### Pattern 2: Upload-Before-Register (Two-Phase)

**What:** Upload metadata JSON to Arweave via Irys BEFORE submitting on-chain registration. On-chain PDA stores the permanent Arweave URI, not the metadata.

**When to use:** Every IP registration. Metadata never goes on-chain.

**Example:**
```typescript
// Source: @irys/upload-solana README + ARCHITECTURE.md
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

async function uploadMetadata(metadata: object, keypairBytes: Uint8Array): Promise<string> {
  const irys = await Uploader(Solana)
    .withWallet(keypairBytes)
    .withRpc(process.env.SOLANA_RPC_URL!);

  const receipt = await irys.upload(JSON.stringify(metadata), {
    tags: [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Mycelium-Protocol" },
      { name: "Type", value: "ip-metadata" },
    ],
  });
  return `https://arweave.net/${receipt.id}`;
}
```

### Pattern 3: BIP-44 Per-Agent Wallet Derivation

**What:** Derive unique Solana keypairs per agent from a single master seed. Path: `m/44'/501'/{agentIndex}'/0'`.

**Example:**
```typescript
// Source: Solana BIP-44 derivation standard
import { derivePath } from "ed25519-hd-key";
import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync } from "bip39";

function deriveAgentKeypair(masterMnemonic: string, agentIndex: number): Keypair {
  const seed = mnemonicToSeedSync(masterMnemonic);
  const path = `m/44'/501'/${agentIndex}'/0'`;
  const derived = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(derived.key);
}
```

### Pattern 4: USDC SPL Token Transfer in Anchor

**What:** License acquisition and royalty distribution use USDC (SPL token, 6 decimals). Requires associated token accounts and `transfer_checked` instruction.

**Critical details:**
- Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (Solana devnet)
- Mainnet USDC mint: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`
- Decimals: 6 (1_000_000 = $1.00 USDC)
- Associated Token Account (ATA) must exist for both sender and receiver
- Use `getOrCreateAssociatedTokenAccount` to ensure ATAs exist before transfer

**Example (TypeScript client-side):**
```typescript
import {
  getOrCreateAssociatedTokenAccount,
  createTransferCheckedInstruction,
} from "@solana/spl-token";

async function payForLicense(
  connection: Connection,
  payer: Keypair,
  licensorPubkey: PublicKey,
  usdcMint: PublicKey,
  amountUsdcLamports: number
) {
  const payerAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, usdcMint, payer.publicKey
  );
  const licensorAta = await getOrCreateAssociatedTokenAccount(
    connection, payer, usdcMint, licensorPubkey
  );
  const ix = createTransferCheckedInstruction(
    payerAta.address,
    usdcMint,
    licensorAta.address,
    payer.publicKey,
    amountUsdcLamports,
    6 // USDC decimals
  );
  // Include in transaction with Hypha acquireLicense instruction
}
```

### Anti-Patterns to Avoid

- **Polling RPC for state changes:** Use Helius webhooks, not setInterval + getAccountInfo.
- **getProgramAccounts for search:** Will break at ~1000 assets. Use PostgreSQL index populated by webhooks.
- **Shared keypair for all agents:** Security disaster. Use BIP-44 HD derivation. One compromise = one agent, not all.
- **Synchronous Arweave upload in registration flow:** Upload can take 1-5s. Do it before the on-chain tx, not in a blocking pipeline.
- **Storing USDC amounts as floats:** Always use integer lamports (6 decimal). 1.50 USDC = 1_500_000 lamports.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| On-chain event indexing | Custom RPC polling loop | Helius webhooks + PostgreSQL | Webhook is push-based, idempotent, handles parsing; polling misses events |
| Permanent metadata storage | Custom file server | Irys/Arweave | Court evidence needs immutability; Irys handles bundling, receipts, SOL payment |
| HD wallet derivation | Custom key generation | ed25519-hd-key + bip39 | Standard BIP-44 path; deterministic, recoverable from mnemonic |
| SPL token transfers | Manual instruction building | @solana/spl-token helpers | ATA creation, decimal handling, transfer_checked are all edge-case-heavy |
| SQL connection pooling | Manual connection management | pg.Pool | Handles connection lifecycle, prepared statements, error recovery |

**Key insight:** Every off-chain service in Phase 2 has a well-tested npm package. The complexity is in wiring them together correctly (ordering, error handling, idempotency), not in the individual pieces.

## Common Pitfalls

### Pitfall 1: Helius Webhook Idempotency

**What goes wrong:** Helius delivers webhooks at-least-once. Your handler processes the same transaction twice, creating duplicate index entries.
**Why it happens:** Network retries, webhook handler responding slowly (>5s timeout).
**How to avoid:** Upsert by transaction signature. Check `if (await db.hasTransaction(tx.signature)) continue;` before processing. Respond 200 immediately.
**Warning signs:** Duplicate rows in PostgreSQL ip_assets table with same tx_signature.

### Pitfall 2: USDC Decimal Confusion

**What goes wrong:** Code treats USDC amounts as whole dollars instead of lamports (6 decimals). A $10 license costs $10,000,000 or $0.00001.
**Why it happens:** SOL uses 9 decimals (LAMPORTS_PER_SOL = 1e9), USDC uses 6. Mixing them silently.
**How to avoid:** Use `BigInt` or integer arithmetic only. Define constants: `const USDC_DECIMALS = 6; const USDC_PER_DOLLAR = 1_000_000;`. Never use floating point for token amounts.
**Warning signs:** License prices that are off by factors of 1000 or 1000000.

### Pitfall 3: Missing Associated Token Accounts

**What goes wrong:** USDC transfer fails with "Account not found" because the recipient doesn't have an ATA for the USDC mint.
**Why it happens:** Unlike SOL (every Solana account can receive SOL), SPL tokens require an explicit Associated Token Account per mint per wallet.
**How to avoid:** Always call `getOrCreateAssociatedTokenAccount` before transfer. The "create" part costs ~0.002 SOL rent. Budget for this in license acquisition flow.
**Warning signs:** "TokenAccountNotFoundError" or "Invalid account owner" errors.

### Pitfall 4: Irys Funding Before Upload

**What goes wrong:** Irys upload fails with "insufficient funds" because the Irys node hasn't been funded.
**Why it happens:** Irys requires pre-funding (depositing SOL to the Irys bundler) before uploads work. This is a separate step from having SOL in your wallet.
**How to avoid:** Check balance with `irys.getBalance()`. Fund with `irys.fund(amount)` if needed. On devnet, use devnet SOL (free from faucet). Budget Irys funding as a setup step.
**Warning signs:** "Not enough funds to send data" error from Irys SDK.

### Pitfall 5: PostgreSQL Not Installed

**What goes wrong:** The development environment has no PostgreSQL server. All indexer, key vault, and query code cannot be tested locally.
**Why it happens:** Windows 11 dev machine doesn't have PostgreSQL installed, and Docker is also not available.
**How to avoid:** Options: (a) Install PostgreSQL locally on Windows, (b) Use a cloud PostgreSQL instance (Supabase, Neon, Railway), (c) Install Docker Desktop + use docker-compose. Recommendation: use Neon or Supabase free tier for development -- zero local install required.
**Warning signs:** Connection refused errors on localhost:5432.

### Pitfall 6: Helius DAS API Doesn't Index Custom Program Accounts

**What goes wrong:** Developer assumes Helius DAS API (getAssetsByGroup, searchAssets) works for custom Anchor PDAs like IPAsset, LicenseTemplate, RoyaltyConfig. It doesn't -- DAS is designed for Metaplex NFTs and SPL tokens.
**Why it happens:** Research or docs mention "Helius DAS API replaces getProgramAccounts" but that's only true for standard asset types.
**How to avoid:** For INF-02, "Helius DAS API replaces getProgramAccounts" means: use Helius webhooks to push events into PostgreSQL, then query PostgreSQL. The DAS API itself is NOT the search backend for custom program accounts. PostgreSQL IS the search backend.
**Warning signs:** Empty results from DAS API calls for custom program PDAs.

### Pitfall 7: Devnet USDC Mint Address

**What goes wrong:** Code uses mainnet USDC mint address on devnet. All token operations fail silently or with confusing errors.
**Why it happens:** The USDC mint is different on devnet vs mainnet. Copy-pasting from examples that use mainnet addresses.
**How to avoid:** Define USDC_MINT as environment-dependent: devnet `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, mainnet `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Or mint your own devnet SPL token for testing.
**Warning signs:** "Account does not exist" when fetching token mint info.

## Code Examples

### PostgreSQL Schema for Indexer

```sql
-- Core indexer tables
CREATE TABLE IF NOT EXISTS processed_transactions (
  signature VARCHAR(128) PRIMARY KEY,
  slot BIGINT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ip_assets (
  pubkey VARCHAR(64) PRIMARY KEY,
  original_creator VARCHAR(64) NOT NULL,
  creator VARCHAR(64) NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  ip_type SMALLINT NOT NULL,
  status SMALLINT NOT NULL,
  metadata_uri TEXT,
  created_at_slot BIGINT NOT NULL,
  created_at_ts TIMESTAMPTZ,
  updated_at_slot BIGINT,
  tx_signature VARCHAR(128) NOT NULL,
  UNIQUE(content_hash)
);

CREATE TABLE IF NOT EXISTS licenses (
  pubkey VARCHAR(64) PRIMARY KEY,
  template_pubkey VARCHAR(64) NOT NULL,
  ip_asset_pubkey VARCHAR(64) NOT NULL REFERENCES ip_assets(pubkey),
  licensor VARCHAR(64) NOT NULL,
  licensee VARCHAR(64),
  license_type SMALLINT NOT NULL,
  price_usdc BIGINT, -- lamports (6 decimals)
  royalty_rate SMALLINT, -- basis points
  is_exclusive BOOLEAN DEFAULT false,
  status SMALLINT NOT NULL,
  created_at_slot BIGINT NOT NULL,
  tx_signature VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS royalty_configs (
  pubkey VARCHAR(64) PRIMARY KEY,
  ip_asset_pubkey VARCHAR(64) NOT NULL REFERENCES ip_assets(pubkey),
  creator VARCHAR(64) NOT NULL,
  recipients JSONB NOT NULL, -- [{address, basisPoints}]
  platform_fee_bps SMALLINT NOT NULL,
  total_deposited BIGINT DEFAULT 0,
  total_distributed BIGINT DEFAULT 0,
  tx_signature VARCHAR(128) NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_wallets (
  agent_id VARCHAR(128) PRIMARY KEY,
  derivation_index INT NOT NULL UNIQUE,
  public_key VARCHAR(64) NOT NULL UNIQUE,
  encrypted_metadata TEXT, -- AES-256-GCM encrypted JSON
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ip_assets_creator ON ip_assets(creator);
CREATE INDEX idx_ip_assets_original_creator ON ip_assets(original_creator);
CREATE INDEX idx_ip_assets_content_hash ON ip_assets(content_hash);
CREATE INDEX idx_licenses_ip_asset ON licenses(ip_asset_pubkey);
CREATE INDEX idx_licenses_licensee ON licenses(licensee);
```

### Helius Webhook Registration

```typescript
// Source: helius-sdk documentation
import { Helius } from "helius-sdk";

const helius = new Helius(process.env.HELIUS_API_KEY!);

await helius.createWebhook({
  webhookURL: "https://your-server.com/webhooks/helius",
  transactionTypes: ["ANY"], // Capture all tx types for our programs
  accountAddresses: [
    "AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz", // Spore
    "9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5", // Hypha
    "9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu", // Rhizome
    "7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc", // Meridian
  ],
  webhookType: "enhanced", // Parsed instruction data
});
```

### Hypha License Template Creation (Live Adapter Pattern)

```typescript
// Loading Hypha IDL and creating license template
const hyphaIdl = JSON.parse(
  readFileSync(join(__dirname, "..", "src", "idl", "mycelium_hypha.json"), "utf-8")
);
const hyphaProgram = new Program(hyphaIdl, provider);

async function createLicenseTemplate(
  ipAssetPubkey: PublicKey,
  licensor: Keypair,
  params: { licenseType: number; priceUsdc: number; royaltyRate: number; /* ... */ }
) {
  const [templatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("license_template"), ipAssetPubkey.toBuffer(), licensor.publicKey.toBuffer()],
    PROGRAM_IDS.hypha
  );

  const tx = await hyphaProgram.methods
    .createLicenseTemplate(params)
    .accountsPartial({
      licenseTemplate: templatePda,
      ipAsset: ipAssetPubkey,
      licensor: licensor.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .signers([licensor])
    .rpc();

  return { templatePda, tx };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| getProgramAccounts for search | Helius webhooks + PostgreSQL index | 2024+ | O(1) queries vs O(n) scans; required at >1K assets |
| @irys/sdk monolith | @irys/upload + @irys/upload-solana (modular) | 2025 | Smaller bundle, tree-shakeable, pay with SOL |
| Shared keypair for agents | BIP-44 HD derivation per agent | Best practice | Each agent has auditable on-chain identity |
| SOL-only payments | USDC via @solana/spl-token | Standard | Commercial licensing requires stablecoin; SOL volatility unacceptable |
| Manual Borsh deserialization | Anchor IDL client (already done in Phase 1) | Phase 1 | Type-safe, no discriminator mismatches |

**Deprecated/outdated:**
- @irys/sdk (monolith): replaced by modular @irys/upload + chain-specific adapters
- getProgramAccounts for production search: replaced by webhook-driven indexing

## Open Questions

1. **PostgreSQL hosting for development**
   - What we know: No PostgreSQL installed locally, no Docker available
   - What's unclear: Whether user prefers local install, cloud instance, or Docker Desktop install
   - Recommendation: Use Neon (neon.tech) or Supabase free tier PostgreSQL. Zero local install. Connection string via env var. Can switch to local later.

2. **Helius webhook endpoint hosting**
   - What we know: Helius needs a publicly accessible HTTPS URL to push webhooks to
   - What's unclear: How to expose local dev server to internet for webhook testing
   - Recommendation: Use ngrok or Helius's built-in webhook testing tool for development. In production, deploy webhook receiver to a cloud service.

3. **Devnet USDC acquisition**
   - What we know: Need USDC on devnet for testing license payments and royalty distribution
   - What's unclear: Whether devnet USDC faucet is reliable
   - Recommendation: Create a custom SPL token mint on devnet that mimics USDC (6 decimals). More reliable than depending on external devnet USDC faucet. Use real devnet USDC mint address for integration tests only.

4. **Phase 1 completion dependency**
   - What we know: Phase 1 is paused at 01-03 Task 2 (devnet redeployment required). Security hardening code is written but programs not redeployed.
   - What's unclear: Whether Phase 2 can start without redeployed programs (Hypha constraints, Rhizome constraints)
   - Recommendation: Phase 2 infrastructure (INF-01 through INF-05) can start immediately -- PostgreSQL, Helius, Irys, key vault don't depend on redeployed programs. Commercial engine (LIC, ROY) needs redeployed programs with security fixes. Plan 02-01 can parallelize with Phase 1 completion.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | Yes | v24.12.0 | -- |
| npm | Package management | Yes | 11.6.2 | -- |
| Python | Similarity Oracle (Phase 3, not Phase 2) | Yes | 3.12.10 | -- |
| PostgreSQL server | INF-01, INF-05 (indexer, key vault) | No | -- | Cloud PostgreSQL (Neon/Supabase free tier) |
| Docker | Local dev orchestration | No | -- | Run services natively; use cloud PostgreSQL |
| Solana CLI | Program deployment verification | Yes | 3.1.13 | -- |
| Anchor CLI | Program builds | Yes | 0.32.1 | -- |
| Helius API key | INF-01, INF-02 | Yes (env var defined) | -- | -- |

**Missing dependencies with no fallback:**
- PostgreSQL server -- MUST be available. Use cloud instance (Neon, Supabase, or Railway free tier).

**Missing dependencies with fallback:**
- Docker -- not needed if PostgreSQL is cloud-hosted and services run natively via Node.js

## Sources

### Primary (HIGH confidence)
- [Helius Webhooks Documentation](https://www.helius.dev/docs/webhooks) -- webhook setup, enhanced transaction format, auth
- [Helius DAS API Documentation](https://www.helius.dev/docs/das-api) -- verified: DAS is for NFTs/tokens, not custom program accounts
- [@irys/upload-solana npm](https://www.npmjs.com/package/@irys/upload-solana) -- v0.1.8, server-side Solana uploads
- [@solana/spl-token npm](https://www.npmjs.com/package/@solana/spl-token) -- v0.4.14, USDC transfer instructions
- [Solana SPL Token Transfers Guide (QuickNode)](https://www.quicknode.com/guides/solana-development/anchor/transfer-tokens) -- Anchor + SPL token patterns
- [ed25519-hd-key npm](https://www.npmjs.com/package/ed25519-hd-key) -- v1.3.0, BIP-44 HD derivation
- [bip39 npm](https://www.npmjs.com/package/bip39) -- v3.1.0, mnemonic seed generation
- [pg npm](https://www.npmjs.com/package/pg) -- v8.20.0, PostgreSQL client
- [helius-sdk npm](https://github.com/helius-labs/helius-sdk) -- v2.2.2, TypeScript SDK

### Secondary (MEDIUM confidence)
- [Irys Gasless Uploader (GitHub)](https://github.com/Irys-xyz/gasless-uploader) -- server-side signing pattern
- [Solana BIP-44 Derivation](https://nick.af/articles/derive-solana-addresses) -- Ed25519 HD key paths
- [Helius Smart Wallets Blog](https://www.helius.dev/blog/solana-smart-wallets) -- agent wallet architecture patterns

### Tertiary (LOW confidence)
- Devnet USDC mint address (`4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`) -- needs verification; may need to mint custom test token

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified against npm registry with current versions
- Architecture: HIGH -- webhook+PostgreSQL pattern is established Solana standard; verified via Helius docs
- Pitfalls: HIGH -- USDC decimal handling, ATA creation, webhook idempotency are well-documented failure modes
- Infrastructure: MEDIUM -- Irys SDK at 0.1.x (pre-1.0) could have API changes; wrapped in adapter to isolate

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days -- stack is stable, no breaking changes expected)
