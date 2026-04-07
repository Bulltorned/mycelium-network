# Architecture

**Analysis Date:** 2026-04-07

## Pattern Overview

**Overall:** Layered protocol architecture with four distinct boundaries — on-chain Solana programs (Anchor/Rust), an MCP server adapter layer (TypeScript), a Next.js frontend, and agent-protocol manifests. Each layer has a clean interface contract; no layer bypasses its boundary.

**Key Characteristics:**
- All persistent state lives on-chain as PDAs; the MCP server is stateless
- Mock/live adapter swap is controlled by a single env flag (`SOLANA_LIVE=1`)
- The `SolanaAdapter` interface is the single contract between MCP tools and chain
- Content never goes on-chain; only hashes and metadata URIs do (Arweave/IPFS holds content)
- Manual Borsh serialization in the live adapter (no generated IDL client yet)

## Layers

**Layer 1 — Solana Programs (Anchor/Rust):**
- Purpose: Immutable on-chain state, PoH timestamps, PDA accounts
- Location: `programs/mycelium-spore/src/lib.rs`, `programs/mycelium-hypha/src/lib.rs`, `programs/mycelium-rhizome/src/lib.rs`, `programs/mycelium-meridian/src/lib.rs`
- Contains: Anchor `#[program]` modules, `#[account]` structs, `#[event]` emissions, `#[error_code]` enums
- Depends on: Solana runtime, anchor-lang
- Used by: MCP live adapter (via RPC), frontend (via wallet-adapter + raw instructions), Anchor test suite

**Layer 2 — Adapter Interface (`SolanaAdapter`):**
- Purpose: Decouples MCP tools from chain implementation; enables mock/live swap
- Location: `src/solana-adapter.ts`
- Contains: `SolanaAdapter` interface (13 methods), parameter types, `MockSolanaAdapter` class (in-memory Map store)
- Depends on: `src/types.ts`
- Used by: `src/index.ts` (MCP server)

**Layer 3 — MCP Server:**
- Purpose: Exposes IP protocol operations as MCP tools and resources to any AI agent
- Location: `src/index.ts`
- Contains: 11 tool registrations, 4 resource registrations (static + dynamic), adapter instantiation, Zod schemas
- Depends on: `@modelcontextprotocol/sdk`, `src/solana-adapter.ts` or `src/solana-live-adapter.ts`, `src/types.ts`
- Used by: Any MCP-compatible AI agent (Anthropic Claude, OpenAI, etc.) via stdio or Streamable HTTP

**Layer 4 — Next.js Frontend:**
- Purpose: Human-facing UI for IP registration and asset browsing
- Location: `app/src/`
- Contains: Pages (`/`, `/register`, `/assets`, `/asset/[pubkey]`), wallet provider, hooks, lib utilities
- Depends on: `@solana/wallet-adapter-react`, `@solana/web3.js`, `app/src/lib/constants.ts` (program IDs + seeds)
- Used by: End users via browser

**Layer 5 — Agent Protocol Manifests:**
- Purpose: Declares Mycelium as a MCP + A2A + UCP endpoint for agent discovery
- Location: `agent-card.json` (A2A protocol), `ucp-manifest.json` (Universal Commerce Protocol)
- Contains: Skills, capabilities, auth schemes, pricing schedules
- Depends on: Nothing — static declarations
- Used by: Agent discovery registries

## Data Flow

**Primary Flow — AI Agent registering IP via MCP:**

1. Agent calls `register_ip` MCP tool with `content_hash`, `perceptual_hash`, `ip_type`, `metadata_uri`
2. `src/index.ts` validates params via Zod schema
3. `adapter.registerIP(params)` is called — routes to `MockSolanaAdapter` (dev) or `SolanaLiveAdapter` (prod)
4. **Mock path:** Stores `IPAsset` in in-memory `Map`, generates fake pubkey and tx signature, returns immediately
5. **Live path (`SolanaLiveAdapter`):** Derives PDA via `findIPAssetPDA(creator, contentHash)`, encodes Anchor instruction manually (discriminator + Borsh), builds `Transaction`, calls `sendAndConfirmTransaction` against RPC, fetches account data, deserializes via `deserializeIPAsset()`
6. Returns `RegisterIPResult` with pubkey, tx signature, Solana Explorer URL, Arweave URL, cost in SOL
7. MCP server wraps result as JSON text content block and returns to agent

**Secondary Flow — Human registering IP via Frontend:**

1. User connects Phantom/Solflare wallet via `SolanaProviders` (`app/src/components/wallet/wallet-provider.tsx`)
2. User drops file on `/register` page
3. `hashFile()` (`app/src/lib/hash.ts`) computes SHA-256 content hash and a salted-SHA-256 perceptual hash using Web Crypto API (client-side, no server)
4. `useRegisterIP` hook (`app/src/hooks/use-register-ip.ts`) derives PDA via `findIPAssetPDA`, encodes instruction data manually (same Borsh layout as live adapter), builds `VersionedTransaction`
5. `sendTransaction(tx, connection)` submits to Solana RPC
6. `connection.confirmTransaction(sig, "confirmed")` awaits confirmation
7. UI shows tx signature + Solana Explorer link

**Evidence Flow — Generating a court-ready MEP via Meridian:**

1. Off-chain orchestration service builds full MEP JSON document
2. MEP JSON is uploaded to Arweave → returns permanent URI
3. SHA-256 hash of MEP computed, protocol authority signs with Ed25519
4. `generate_mep` instruction called on Meridian program → creates `EvidencePackage` PDA
5. PDA stores: `package_hash`, `arweave_uri`, `protocol_signature`, `jurisdiction`, `generated_slot`
6. Anyone can verify: fetch Arweave content, recompute hash, compare to on-chain PDA record

**Royalty Flow (Rhizome):**

1. IP owner calls `configure_royalty` → creates `RoyaltyConfig` PDA with up to 8 recipients and basis-point splits (must sum to 10,000)
2. Licensee calls `deposit_royalty` → SOL transferred to `royalty_vault` PDA
3. Anyone calls `distribute_royalties` → single atomic transaction splits vault balance to all recipients minus platform fee
4. Recipients call `withdraw` to claim accumulated balance

**State Management:**
- All authoritative state is on-chain PDAs on Solana devnet
- `MockSolanaAdapter` maintains in-memory Maps for dev/test — state is lost on restart
- `SolanaLiveAdapter` has a small in-memory `agentWallets` Map (acknowledged tech debt — production needs a database)
- Frontend has local React state only (form fields, loading flags, tx signatures)

## Key Abstractions

**`SolanaAdapter` (interface):**
- Purpose: The single boundary contract between MCP logic and blockchain implementation
- Location: `src/solana-adapter.ts` (lines 37-63)
- Pattern: Strategy pattern — `MockSolanaAdapter` and `SolanaLiveAdapter` are interchangeable implementations
- Selection: `const useLive = process.env.SOLANA_LIVE === "1" || !!process.env.SOLANA_RPC_URL`

**PDA Seeds (deterministic account addressing):**
- Purpose: Makes every on-chain account derivable from public inputs — no database needed
- Spore: `["ip_asset", creator_pubkey, content_hash]` → IPAsset PDA
- Hypha: `["license_template", ip_asset, licensor]`, `["license", template, licensee]`
- Rhizome: `["royalty_config", ip_asset]`, `["royalty_vault", ip_asset]`
- Meridian: `["evidence", ip_asset, requester]`
- Defined in: `programs/*/src/lib.rs` (Rust constants), `app/src/lib/constants.ts` (TS mirror), `app/src/lib/pda.ts` (TS helpers)

**`IPAsset` (core data type):**
- Purpose: Represents a registered IP work — mirrors the on-chain Anchor account struct exactly
- TypeScript definition: `src/types.ts` (`interface IPAsset`)
- Rust definition: `programs/mycelium-spore/src/lib.rs` (`pub struct IPAsset`)
- Key invariant: `originalCreator` is immutable (used in PDA seed), `creator` can change on transfer

**Anchor Instruction Discriminator:**
- Purpose: Identifies which program instruction to execute — `SHA-256("global:instruction_name")[0..8]`
- Used in: `src/solana-live-adapter.ts` (hardcoded bytes), `app/src/hooks/use-register-ip.ts` (hardcoded bytes)
- Note: Both use hardcoded discriminator bytes instead of generated IDL client — this is the main fragility point

## Entry Points

**MCP Server (stdio):**
- Location: `src/index.ts` (line 1, `#!/usr/bin/env node`)
- Triggers: `node dist/index.js` or `tsx src/index.ts`
- Responsibilities: Instantiate adapter (mock or live), register 11 tools + 4 resources, start `StdioServerTransport`, listen for MCP messages

**Next.js App:**
- Location: `app/src/app/layout.tsx` (root layout), `app/src/app/page.tsx` (home)
- Triggers: `next dev` or `next start` from `app/` directory
- Responsibilities: Mount wallet provider context, render pages, connect to Solana RPC

**Anchor Test Runner:**
- Location: `tests/mycelium-spore.ts`, `tests/mycelium-hypha.ts`, `tests/mycelium-meridian.ts`
- Triggers: `anchor test`
- Responsibilities: Deploy programs to local validator, call instructions via `@coral-xyz/anchor`, assert account state

## Error Handling

**Strategy:** Fail fast with typed errors. Programs use `#[error_code]` enums. MCP tools wrap all adapter calls in try/catch and return `{ isError: true }` content blocks with the error message — agents receive structured failure, not thrown exceptions.

**Patterns:**
- Anchor programs: `require!(condition, MyceliumError::Variant)` — rejects invalid state before mutation
- MCP tools: `try { ... } catch (err) { return { content: [{ type: "text", text: \`operation failed: ${err.message}\` }], isError: true } }`
- Live adapter: Falls back to `fallbackIPAsset()` if account deserialization fails after a confirmed transaction
- Status transitions in Spore are validated via `match` — invalid transitions (e.g., Active → Revoked directly) return `MyceliumError::InvalidStatusTransition`

## Cross-Cutting Concerns

**Logging:** `console.error(...)` to stderr only (stdout is reserved for MCP JSON protocol). Live adapter logs RPC URL, payer pubkey, and program IDs on initialization.

**Validation:** Two-layer — Zod schemas in MCP tools (agent-facing), `require!()` macros in Anchor programs (chain-enforced). Frontend uses basic HTML constraints + `hashFile()` preconditions.

**Authentication:**
- MCP server: Agent identity from `MYCELIUM_AGENT_ID` env var or `"default-agent"`. Production: extract from OAuth token or DID.
- Frontend: Solana wallet signature (Phantom/Solflare) — the wallet IS the identity
- A2A: OAuth2 or API key (declared in `agent-card.json`, not yet implemented in server)
- Custodial wallets: `SolanaLiveAdapter.agentWallets` Map — agents get a server-side keypair derived from their `agentId`

---

*Architecture analysis: 2026-04-07*
