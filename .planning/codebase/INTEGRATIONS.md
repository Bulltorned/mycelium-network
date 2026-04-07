# External Integrations

**Analysis Date:** 2026-04-07

## Blockchain — Solana

**Network:**
- Solana Devnet (current deployment)
- RPC: `https://api.devnet.solana.com` (default)
- SDK: `@solana/web3.js` in both MCP server and web app
- Anchor client: `@coral-xyz/anchor` in web app; raw instruction building in `src/solana-live-adapter.ts`

**On-chain Programs (all deployed to devnet):**

| Program | Address | Purpose |
|---------|---------|---------|
| mycelium-spore | `AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz` | IP registration, Proof of Existence |
| mycelium-hypha | `9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5` | Programmable licensing |
| mycelium-rhizome | `9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu` | Royalty distribution engine |
| mycelium-meridian | `7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc` | WIPO evidence module |

**Auth:** Keypair file at `~/solana-keys/id.json` (env: `SOLANA_KEYPAIR_PATH`)

## Indexing — Helius

**Purpose:** DAS (Digital Asset Standard) API for efficient read queries and event parsing. Falls back to direct Solana RPC if unavailable.
- Auth: `HELIUS_API_KEY` environment variable
- Usage: `src/solana-live-adapter.ts` — `SolanaLiveAdapter` class stores `heliusApiKey` and uses it for `searchIP` queries
- Note: `src/solana-adapter.ts` architecture comment calls out Helius as the intended indexer for production read queries. The live adapter currently falls back to RPC `getProgramAccounts` scans — comment in `src/solana-live-adapter.ts` line 399 flags this as expensive on mainnet.

## Permanent Storage — Arweave / Irys

**Purpose:** Permanent off-chain storage for IP metadata JSON and Evidence Package documents (MEP).
- Referenced in: `src/solana-adapter.ts` (architecture comment), `src/solana-live-adapter.ts` (comment: "Arweave/Irys")
- URI format: `arweave://...` or `ipfs://...` stored in IPAsset.metadataUri field
- Flow: Content uploaded to Arweave before calling `register_ip` → Arweave URI passed as `metadata_uri` parameter → stored in on-chain PDA
- For Meridian evidence packages: MEP JSON uploaded to Arweave, SHA-256 hash anchored on-chain
- SDK: Not yet integrated as npm dependency — upload handled off-chain before MCP tool invocation

## Payment — USDC (SPL Token)

**Purpose:** License payments and dispute escrow denominated in USDC.
- Implementation: `anchor-spl` 0.30.1 in mycelium-rhizome program
- Denominated in USDC lamports (6 decimals: `1_000_000 = $1.00`)
- Current status: USDC balance query in `src/solana-live-adapter.ts` returns SOL balance as proxy — comment on line 635 marks USDC SPL token integration as `TODO`
- Mock adapter in `src/solana-adapter.ts` seeds test wallets with `100_000_000` USDC lamports ($100) for development

## MCP Protocol — Anthropic Model Context Protocol

**Purpose:** Expose all IP operations to any MCP-compatible AI agent without requiring blockchain knowledge.
- SDK: `@modelcontextprotocol/sdk` ^1.12.1 (`src/index.ts`)
- Transport: stdio (local/development), Streamable HTTP (production)
- Server name: `mycelium-ip`, version `0.1.0`
- 12 tools exposed: `register_ip`, `search_ip`, `check_license`, `acquire_license`, `create_license`, `verify_provenance`, `check_similarity`, `generate_evidence`, `file_dispute`, `get_wallet`, `list_my_assets`, `list_my_licenses`
- 4 resource types: `ip://asset/{pubkey}`, `ip://license/{pubkey}`, `ip://provenance/{pubkey}`, `ip://registry/stats`
- Agent identity: `MYCELIUM_AGENT_ID` env var (defaults to `"default-agent"`)

## A2A Protocol — Agent-to-Agent

**Purpose:** Standardized agent card for A2A protocol discovery.
- Manifest: `agent-card.json` at project root
- Schema: `https://a2a-protocol.org/schemas/agent-card/v1`
- URL: `https://agent.mycelium.network/a2a` (production target)
- Auth schemes: OAuth2 + API Key
- OAuth2 endpoints: `https://auth.mycelium.network/oauth2/authorize` and `https://auth.mycelium.network/oauth2/token`
- API Key header: `X-Mycelium-API-Key`
- 6 skills declared: ip-registration, license-management, similarity-check, provenance-verification, evidence-generation, dispute-resolution

## Universal Commerce Protocol (UCP)

**Purpose:** Commerce-layer manifest for AI agent purchasing flows.
- Manifest: `ucp-manifest.json` at project root
- Schema: `https://ucp.dev/schemas/manifest/v1`
- API base: `https://mycelium.network`
- Capabilities: discovery (search + get_product), cart (create + add_item)
- Supported currencies: USDC, USD
- Fulfillment type: instant_digital

## Similarity Oracle (Planned)

**Purpose:** Multi-layer content fingerprint matching for infringement detection.
- Layer 1: Perceptual hashing — pHash (images), Chromaprint (audio), SimHash (text)
- Layer 2: Embedding similarity — CLIP (images), CLAP (audio), multilingual-e5 (text)
- Vector DB: Qdrant — referenced in `src/solana-adapter.ts` architecture comment as the similarity search backend
- Status: Interface defined in `SolanaAdapter` (`checkSimilarity` method); mock implementation returns stub results; Qdrant integration not yet implemented in `src/solana-live-adapter.ts`

## C2PA Content Provenance

**Purpose:** AI-generated content provenance manifests (Coalition for Content Provenance and Authenticity).
- Supported in `IPMetadata.c2paManifest` field (`src/types.ts`) as base64-encoded manifest
- Not yet a runtime dependency — field accepted and stored but no SDK integration

## Solana Wallet Adapters — Frontend

**Purpose:** Browser wallet connection for web app users.
- Supported wallets: Phantom, Solflare (configured in `app/src/components/wallet/wallet-provider.tsx`)
- SDK: `@solana/wallet-adapter-react` + `@solana/wallet-adapter-wallets`
- Auto-connect enabled
- Connection endpoint: `NEXT_PUBLIC_SOLANA_RPC_URL` (defaults to devnet)

## Solana Explorer

**Purpose:** Transaction and account verification links surfaced in MCP tool responses.
- Devnet explorer: `https://explorer.solana.com/address/{address}?cluster=devnet`
- Mainnet explorer: `https://explorer.solana.com/address/{address}`
- Configured in `app/src/lib/constants.ts`; also constructed inline in `src/solana-live-adapter.ts`

## Evidence — Jurisdiction Targets

**Purpose:** The Meridian program anchors evidence packages formatted for court submission in specific jurisdictions.
- Indonesia: UU ITE Pasal 5 (Indonesian Commercial Court)
- Kenya: Evidence Act Section 106B
- Colombia: Ley 527 + CGP Artículo 247
- China: Internet Court
- US: Federal Rules of Evidence
- UK: Practice Direction 31B
- EU: eIDAS
- South Africa: (supported)
- WIPO: Arbitration and Mediation Center submission

## Environment Configuration

**Required env vars — MCP server production:**
- `SOLANA_RPC_URL` — RPC endpoint
- `SOLANA_KEYPAIR_PATH` — Authority keypair for signing transactions
- `SOLANA_LIVE=1` — Activate live adapter (otherwise mock is used)
- `HELIUS_API_KEY` — Optional but needed for efficient indexing at scale
- `MYCELIUM_AGENT_ID` — Agent identity (OAuth subject, API key hash, or DID)
- `MYCELIUM_SPORE_PROGRAM_ID` — Override program address (optional)

**Required env vars — web app:**
- `NEXT_PUBLIC_SOLANA_CLUSTER` — `devnet` or `mainnet-beta`
- `NEXT_PUBLIC_SOLANA_RPC_URL` — RPC endpoint

**Secrets location:**
- `.env` and `.env.local` in `.gitignore` — never committed
- Keypair JSON at `~/solana-keys/id.json` — outside repo

## Webhooks & Callbacks

**Incoming:**
- Not yet implemented — UCP manifest references `/api/ucp/*` endpoints as planned targets

**Outgoing:**
- None implemented

---

*Integration audit: 2026-04-07*
