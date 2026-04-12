# Technology Stack

**Project:** Mycelium Protocol — Production Hardening
**Researched:** 2026-04-12
**Mode:** Ecosystem (subsequent milestone — brownfield with 4 deployed programs on devnet)

## Decision Context

Mycelium has 4 Anchor 0.30.1 programs deployed on devnet, a TypeScript MCP server, and a Next.js 14 frontend. The question is not "what to build with" but "what to upgrade, what to add, and what to leave alone" for production readiness.

## Recommended Stack

### On-Chain Framework

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Anchor | 0.30.1 (STAY) | Solana program framework | Programs are deployed and working on devnet. Upgrading to 0.31+ changes discriminator semantics (variable-length discriminators replace fixed 8-byte), breaks all existing account deserialization, and requires redeploying all 4 programs. Anchor 1.0.0 released Apr 2, 2026 — too fresh for production protocol. **Upgrade to 0.31+ is a post-mainnet concern.** | HIGH |
| anchor-lang | 0.30.1 | Rust program crate | Pinned to match deployed programs. Do not mix versions across the 4 programs. | HIGH |
| anchor-spl | 0.30.1 | SPL token integration (Rhizome) | Required for USDC payment flows. Already in use. | HIGH |

**Why NOT upgrade Anchor now:**
- 0.31.0 (Jul 2025): Variable-length discriminators break `space = 8 + ...` patterns. New `Discriminator::DISCRIMINATOR` constant required. All existing accounts would need migration.
- 0.32.0 (Dec 2025): Requires Solana CLI 2.3.0 and Rust 1.89+. IDL auto-uploaded on deploy. `anchor verify` uses `solana-verify` instead of Docker — old builds fail verification.
- 1.0.0 (Apr 2, 2026): 10 days old. Zero production track record. Moved repo to `solana-foundation/anchor`. Would be irresponsible to adopt for a protocol handling IP registration.

**Upgrade path for later:** 0.30.1 -> 0.31.x (with Migration account type for schema changes) -> 0.32.x (once stable) -> 1.0.x (6+ months after release).

### IDL Client Generation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @coral-xyz/anchor (TS) | 0.30.1 | IDL-based TypeScript client | Must match on-chain Anchor version. The 0.30.x IDL format generates typed `.accounts()`, `.accountsPartial()`, `.accountsStrict()` methods. **This replaces all 3 manual Borsh deserializers** in the MCP server and fixes the discriminator mismatch between MCP and frontend. | HIGH |
| `anchor build` IDL output | 0.30.1 | Generate `target/idl/*.json` | Run `anchor build` to regenerate IDLs for all 4 programs. Import these IDLs in both MCP server and frontend. Single source of truth. | HIGH |

**Pattern — IDL client usage:**
```typescript
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { MyceliumSpore } from "../target/types/mycelium_spore";
import sporeIdl from "../target/idl/mycelium_spore.json";

const program = new Program<MyceliumSpore>(sporeIdl as MyceliumSpore, provider);
// Typed accounts, typed instructions, correct discriminators — no manual Borsh
```

**What to delete:** `src/solana-live-adapter.ts` manual Borsh deserialization for IPAsset, LicenseTemplate, RoyaltyConfig. Replace with `program.account.ipAsset.fetch(pda)`.

### Solana Client Libraries

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @solana/web3.js | 1.98.x (STAY on v1) | RPC, transactions, keypairs | v2 (@solana/kit) is production-ready but Anchor 0.30.x does NOT support it. Anchor's TS client depends on web3.js v1 internally. Mixing v1 and v2 in the same project causes type conflicts. **Stay on v1 until Anchor upgrade.** | HIGH |
| @solana/wallet-adapter-react | 0.15.x | Frontend wallet connection | Works with web3.js v1. Stable, widely used. | HIGH |
| @solana/spl-token | 0.4.x | SPL token operations (USDC) | Required for Rhizome royalty distribution and Hypha license payments. Use `createTransferCheckedInstruction` for USDC (6 decimals). | MEDIUM |

**Why NOT @solana/web3.js v2 (aka @solana/kit):**
- Anchor 0.30.x TS client has hard dependency on v1
- Complete API rewrite (functional, tree-shakeable) — not a drop-in upgrade
- @solana/web3-compat shim exists but adds complexity for zero benefit when Anchor pins you to v1
- PROJECT.md correctly marks this as out of scope until post-M4

### Metadata Storage (Arweave/Irys)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @irys/upload | latest | Core upload SDK | Modular architecture — import only what you need. Replaces deprecated @irys/sdk monolith. | MEDIUM |
| @irys/upload-solana | 0.1.x | Solana-specific upload adapter (Node.js) | Pays for uploads with SOL. Use for MCP server (server-side uploads). | MEDIUM |
| @irys/web-upload-solana | latest | Browser upload adapter | For frontend direct uploads (user pays from connected wallet). | MEDIUM |

**Pattern — server-side upload (MCP server):**
```typescript
import { Uploader } from "@irys/upload";
import { Solana } from "@irys/upload-solana";

const irys = await Uploader(Solana)
  .withWallet(keypairSecretKey)
  .withRpc(solanaRpcUrl);

const receipt = await irys.upload(JSON.stringify(metadata), {
  tags: [
    { name: "Content-Type", value: "application/json" },
    { name: "App-Name", value: "Mycelium-Protocol" },
    { name: "IP-Hash", value: contentHash },
  ],
});
// receipt.id = Arweave transaction ID
// URI: https://arweave.net/{receipt.id}
```

**Why Irys over raw Arweave:**
- Instant uploads (no 20+ minute Arweave confirmation wait)
- SOL payment (no need to bridge to AR token)
- Receipts provide proof of upload for MEP evidence chain
- Metaplex standard — same pipeline used by all Solana NFT metadata

**Why NOT alternatives:**
- Shadow Drive (GenesysGo): Solana-native but mutable storage, not permanent. Court evidence needs immutability.
- IPFS/Filecoin: No permanence guarantee without pinning services. Content can disappear.
- Raw Arweave (arweave-js): 20+ minute confirmation, need AR tokens, no Solana wallet support.

**Cost consideration:** Irys charges ~$0.0001 per KB. A typical IP metadata JSON (~2KB) costs ~$0.0002. At INFIA scale (36+ IPs with multiple evidence snapshots), annual storage cost is negligible (<$1).

### Indexing (Helius)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Helius RPC | - | Enhanced RPC with DAS API | Already configured (HELIUS_API_KEY env var exists). Replaces public devnet RPC for production. Rate limits, reliability, parsed transactions. | HIGH |
| Helius Webhooks | - | Real-time account change notifications | Monitor all 4 program PDAs. Push model eliminates polling. Supports up to 100K addresses per webhook. | HIGH |
| Helius Enhanced Websockets | - | Geyser-powered real-time streaming | For the frontend: live updates when IP status changes, new licenses created, royalties distributed. Lower latency than webhooks. | MEDIUM |
| helius-sdk | latest | TypeScript SDK for Helius APIs | Typed wrappers for DAS, webhooks, enhanced transactions. Reduces boilerplate. | MEDIUM |

**Integration pattern for Mycelium:**

1. **Search/Browse (DAS API):** Use `getAssetsByGroup` or custom `getTransactionsForAddress` with program ID filter to find all IPAsset PDAs. This replaces the current approach of scanning accounts with `getProgramAccounts` (which doesn't scale).

2. **Real-time Updates (Webhooks):** Register webhook for each program address. Helius sends parsed transaction data to your endpoint when any instruction fires. Use for:
   - New IP registrations → update search index
   - License acquisitions → notify IP owner
   - Royalty distributions → update dashboards
   - Status changes → trigger evidence snapshots

3. **Frontend Live Data (Enhanced Websockets):** Subscribe to specific PDA accounts for real-time UI updates without page refresh.

**Why NOT alternatives:**
- `getProgramAccounts` RPC: O(n) scan of all accounts. Breaks at ~1000 accounts. Not viable for production.
- Self-hosted Geyser plugin: Requires running a validator. Massive infrastructure overhead for a protocol this size.
- TheGraph (Solana subgraphs): Exists but immature on Solana compared to EVM. Helius is the Solana-native standard.
- Triton (RPCPool): Good RPC provider but lacks Helius's DAS API and webhook ecosystem.

### Per-Agent Wallet Derivation

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ed25519-hd-key | 1.3.x | BIP-44 HD key derivation for Ed25519 | Derives child keypairs from a master seed. Standard for Solana HD wallets. | MEDIUM |
| bip39 | 3.1.x | Mnemonic seed phrase generation | Generate master seed from 24-word mnemonic. Standard BIP-39. | HIGH |

**Pattern — per-agent wallet derivation:**
```typescript
import { derivePath } from "ed25519-hd-key";
import { Keypair } from "@solana/web3.js";
import { mnemonicToSeedSync } from "bip39";

// Master seed from mnemonic (stored securely, never in code)
const seed = mnemonicToSeedSync(masterMnemonic);

// Derive per-agent keypair using BIP-44 path
// m/44'/501'/agentIndex'/0'
// All levels hardened (required for Ed25519 per SLIP-0010)
function deriveAgentKeypair(agentIndex: number): Keypair {
  const path = `m/44'/501'/${agentIndex}'/0'`;
  const derived = derivePath(path, seed.toString("hex"));
  return Keypair.fromSeed(derived.key);
}

// Agent 0: m/44'/501'/0'/0' — protocol authority
// Agent 1: m/44'/501'/1'/0' — MCP server agent
// Agent 2: m/44'/501'/2'/0' — evidence engine agent
// etc.
```

**Why BIP-44 HD derivation over alternatives:**
- **Not shared keypair:** Current system uses single `SOLANA_KEYPAIR_PATH` for everything. One compromise = total loss.
- **Not random keypairs per agent:** Unrecoverable if lost. No master backup.
- **HD derivation:** Single master mnemonic backs up all agent wallets. Deterministic — can regenerate any agent's keypair from index.
- **Auditable:** Each agent has a unique on-chain identity. Transactions are traceable to specific agents.

**Security requirements:**
- Master mnemonic stored in KMS (AWS Secrets Manager, HashiCorp Vault, or at minimum encrypted env var)
- Never derive in the browser — server-side only
- Each agent keypair should have minimal SOL balance (just enough for transactions)
- Protocol authority keypair (index 0) stored separately with multisig for mainnet

### Account Migration Pattern

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Anchor `realloc` constraint | 0.30.1 | Resize existing accounts | Built into Anchor. Use `#[account(mut, realloc = new_size, realloc::payer = payer, realloc::zero = false)]` to add fields like `original_creator` to existing IPAsset accounts. | HIGH |
| Version byte pattern | - | Account schema versioning | Add `version: u8` as first field after discriminator. Allows future migrations without redeploying. | HIGH |

**Pattern — versioned account with realloc:**
```rust
#[account]
pub struct IPAsset {
    pub version: u8,           // 1 byte — always first, enables future migration
    pub original_creator: Pubkey, // 32 bytes — immutable, set once
    pub creator: Pubkey,       // 32 bytes — mutable (ownership transfer)
    pub content_hash: [u8; 32],
    pub ip_type: u8,
    pub status: u8,
    pub created_at: i64,
    pub updated_at: i64,
    pub metadata_uri: String,  // 4 + len bytes
    pub bump: u8,
}

// Migration instruction
#[derive(Accounts)]
pub struct MigrateIPAssetV2<'info> {
    #[account(
        mut,
        realloc = 8 + IPAsset::INIT_SPACE, // or calculate manually
        realloc::payer = payer,
        realloc::zero = false,
        seeds = [b"ip_asset", original_creator.key().as_ref(), &content_hash],
        bump = ip_asset.bump,
    )]
    pub ip_asset: Account<'info, IPAsset>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

**Why realloc over redeploy-with-new-schema:**
- Preserves existing PDAs and their addresses (no broken references)
- Existing Meridian MEP evidence packages remain valid
- No need to coordinate a "big bang" migration of all accounts
- Can migrate accounts lazily (on next interaction) or eagerly (batch script)

**Anchor 0.31+ has a dedicated `Migration<'info, From, To>` account type** that abstracts this further, but since we're staying on 0.30.1, use the realloc constraint directly.

### Frontend

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Next.js | 14.2.x (STAY) | Frontend framework | Already deployed, working. Next.js 15 has breaking changes (async request APIs, React 19 requirement). No benefit to upgrading mid-production push. | HIGH |
| React | 18.3.x (STAY) | UI library | Stable. React 19 not needed. | HIGH |
| @tanstack/react-query | 5.x | Server state for on-chain data | Already in use. Handles caching, refetching, optimistic updates for blockchain queries. | HIGH |
| Tailwind CSS | 3.4.x (STAY) | Styling | Tailwind 4 released but significant config changes. Stay on 3.x. | HIGH |

### MCP Server

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| @modelcontextprotocol/sdk | ^1.12.1 | MCP protocol | Already in use. Follow semver — minor updates OK. | HIGH |
| zod | ^3.24.4 | Schema validation | Already in use. Stable. | HIGH |
| tsx | ^4.21.0 | Dev execution | Already in use. Dev only. | HIGH |

### Testing

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| ts-mocha | latest | Anchor integration tests | Already configured in Anchor.toml. Standard for Anchor projects. | HIGH |
| chai | latest | Assertions | Pairs with ts-mocha. Standard Anchor test pattern. | HIGH |
| @solana/bankrun | latest | Fast local program testing | Lightweight alternative to `solana-test-validator`. Runs programs in-process. Dramatically faster test cycles. Use for unit-level program tests. | MEDIUM |

### Infrastructure (Mainnet)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Helius RPC (paid plan) | - | Production RPC | Dedicated nodes, higher rate limits, DAS API, webhooks included. Standard tier ($49/mo) sufficient for launch. | HIGH |
| Squads Protocol | v4 | Program upgrade multisig | **Required for mainnet.** Single-key program upgrades are unacceptable for production. Squads is the standard Solana multisig. 2-of-3 minimum for program authority. | HIGH |
| Vercel | - | Frontend hosting | Next.js native platform. Already considered (per PROJECT.md). | MEDIUM |

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| On-chain framework | Anchor 0.30.1 | Anchor 1.0.0 | 10 days old, zero production track record, breaking discriminator changes |
| On-chain framework | Anchor 0.30.1 | Native Solana (no framework) | 4 programs already written in Anchor, rewrite would be months of work |
| Solana client | @solana/web3.js v1 | @solana/web3.js v2 (@solana/kit) | Anchor 0.30.x TS client incompatible with v2 |
| Metadata storage | Irys (Arweave) | Shadow Drive | Mutable storage, court evidence needs immutability |
| Metadata storage | Irys (Arweave) | IPFS/Filecoin | No permanence guarantee without pinning |
| Indexing | Helius | Self-hosted Geyser | Massive infra overhead, unnecessary at this scale |
| Indexing | Helius | TheGraph (Solana) | Immature on Solana, Helius is native standard |
| Multisig | Squads v4 | Manual multisig | Squads is the Solana standard, battle-tested |
| Testing | ts-mocha + bankrun | Jest | ts-mocha is Anchor convention, bankrun is faster than test-validator |
| HD wallets | BIP-44 derivation | Random keypairs per agent | Unrecoverable, no master backup |

## Installation

### MCP Server (add to existing package.json)

```bash
# IDL client (MUST match on-chain Anchor version)
npm install @coral-xyz/anchor@0.30.1

# Irys metadata upload
npm install @irys/upload @irys/upload-solana

# Helius SDK
npm install helius-sdk

# HD wallet derivation
npm install ed25519-hd-key bip39

# SPL token (USDC payments)
npm install @solana/spl-token@0.4
```

### Frontend (add to app/package.json)

```bash
# Irys browser upload (if enabling user-initiated uploads)
npm install @irys/web-upload-solana

# Helius SDK (for enhanced websocket subscriptions)
npm install helius-sdk
```

### Dev Dependencies

```bash
# Fast program testing
npm install -D @solana/bankrun

# Already present: ts-mocha, typescript, tsx, @types/node
```

### Rust (no changes to Cargo.toml)

Stay on `anchor-lang = "0.30.1"` and `anchor-spl = "0.30.1"` across all 4 programs. Do not update.

## Version Pinning Strategy

| Package | Pin Strategy | Rationale |
|---------|-------------|-----------|
| anchor-lang (Rust) | Exact: `"0.30.1"` | Must match deployed programs |
| @coral-xyz/anchor (TS) | Exact: `"0.30.1"` | Must match on-chain Anchor version |
| @solana/web3.js | Range: `"^1.98.0"` | v1.x receives security patches, semver-safe |
| @irys/upload-solana | Range: `"^0.1.8"` | Pre-1.0, but modular — low blast radius |
| helius-sdk | Range: `"^latest"` | API wrapper, backward-compatible |
| Next.js | Exact: `"14.2.21"` | Framework — minor version changes can break |
| React | Exact: `"18.3.1"` | Must align with Next.js |

## Key Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Anchor 0.30.1 is 2 versions behind stable | LOW | Security patches backported. Programs are immutable once deployed — vulnerabilities are in the framework code, not your program binary. Upgrade on next major milestone. |
| @irys/upload-solana at 0.1.x (pre-1.0) | MEDIUM | API may change. Wrap in thin adapter layer. If Irys SDK breaks, raw arweave-js is fallback. |
| Helius vendor lock-in | LOW | Webhooks are standard HTTP POST. DAS queries can be replaced with getProgramAccounts (slower but works). RPC is swappable. |
| web3.js v1 EOL eventually | LOW | v1 still receives security patches. Migration is post-Anchor-upgrade concern. |

## Sources

- [Anchor Releases (GitHub)](https://github.com/solana-foundation/anchor/releases) — Anchor 1.0.0 released Apr 2, 2026
- [Anchor 0.31.0 Release Notes](https://www.anchor-lang.com/docs/updates/release-notes/0-31-0) — Variable discriminators, Migration type
- [Anchor 0.32.0 Release Notes](https://www.anchor-lang.com/docs/updates/release-notes/0-32-0) — solana-verify, Solana 2.3.0 requirement
- [@coral-xyz/anchor npm](https://www.npmjs.com/package/@coral-xyz/anchor) — Latest TS client: 0.32.1
- [Solana Web3.js 2.0 (Anza)](https://www.anza.xyz/blog/solana-web3-js-2-release) — v2 release, Anchor incompatibility
- [Helius Webhooks](https://www.helius.dev/docs/webhooks) — Real-time monitoring
- [Helius DAS API](https://www.helius.dev/docs/rpc/how-to-index-solana-data) — Indexing patterns
- [Helius Geyser Enhanced Websockets](https://docs.helius.dev/webhooks-and-websockets/enhanced-websockets-geyser-yellowstone) — Real-time streaming
- [@irys/upload-solana npm](https://www.npmjs.com/package/@irys/upload-solana) — v0.1.8
- [Irys JS SDK (GitHub)](https://github.com/Irys-xyz/js-sdk) — Modular upload architecture
- [Solana BIP-44 Derivation](https://nick.af/articles/derive-solana-addresses) — Ed25519 HD key paths
- [Solana Cookbook: Account Migration](https://solanacookbook.com/guides/data-migration.html) — Version byte pattern
- [Anchor Migration Account Type PR](https://github.com/solana-foundation/anchor/pull/4060) — 0.31+ Migration<From, To>
- [Squads Protocol](https://squads.xyz/blog/solana-multisig-program-upgrades-management) — Program upgrade multisig
