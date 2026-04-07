# Technology Stack

**Analysis Date:** 2026-04-07

## Languages

**Primary:**
- TypeScript 5.7 — MCP server (`src/`), Next.js web app (`app/src/`), Anchor test suites (`tests/`)
- Rust — Four Solana on-chain programs (`programs/*/src/lib.rs`)

**Secondary:**
- None detected

## Runtime

**Environment:**
- Node.js >= 20.0.0 (enforced in `package.json` `engines` field)

**Package Manager:**
- npm — root MCP server (`package-lock.json` present)
- npm — web app (`app/package-lock.json` present)
- Lockfiles: present in both locations

## Frameworks

**On-chain (Rust):**
- Anchor 0.30.1 — Solana smart contract framework; used in all four programs (`programs/*/Cargo.toml`)

**Frontend:**
- Next.js 14.2.21 — React web app (`app/package.json`); App Router with `src/app/` layout
- React 18.3.1 — UI library (`app/package.json`)
- Tailwind CSS 3.4.17 — Utility-first styling (`app/devDependencies`)

**MCP Server:**
- `@modelcontextprotocol/sdk` ^1.12.1 — Anthropic MCP protocol SDK; server transport via stdio (dev) and Streamable HTTP (prod) (`src/index.ts`)

**Testing:**
- ts-mocha — Anchor integration test runner (configured in `Anchor.toml` scripts)

**Build:**
- TypeScript compiler (`tsc`) — compiles `src/` to `dist/` (`tsconfig.json`, `outDir: dist`)
- `tsx` ^4.21.0 — dev-mode direct execution of TypeScript (`package.json` dev script)
- SWC — Next.js build pipeline (`.next/cache/swc/`)

## Key Dependencies

**Critical — MCP Server (`package.json`):**
- `@modelcontextprotocol/sdk` ^1.12.1 — MCP protocol; exposes 12 tools and 4 resource types to any MCP-compatible AI agent
- `@solana/web3.js` ^1.98.0 — Solana RPC connection, keypair handling, transaction building in `src/solana-live-adapter.ts`
- `zod` ^3.24.4 — Runtime schema validation for all MCP tool inputs in `src/index.ts`

**Critical — Web App (`app/package.json`):**
- `@coral-xyz/anchor` ^0.30.1 — Anchor client for program interaction from browser
- `@solana/web3.js` ^1.95.8 — Solana connection and wallet
- `@solana/wallet-adapter-react` ^0.15.35 — React wallet context provider
- `@solana/wallet-adapter-wallets` ^0.19.32 — Phantom and Solflare wallet adapters
- `@tanstack/react-query` ^5.62.0 — Server state management for on-chain data
- `lucide-react` ^0.468.0 — Icon library

**Rust (`programs/*/Cargo.toml`):**
- `anchor-lang` 0.30.1 — All four programs
- `anchor-spl` 0.30.1 — mycelium-rhizome only (SPL token / USDC payment flows)

## Configuration

**Environment — MCP Server:**
- `SOLANA_LIVE=1` — Switch from mock to live Solana adapter (`src/index.ts`)
- `SOLANA_RPC_URL` — Solana RPC endpoint (default: `https://api.devnet.solana.com`)
- `SOLANA_KEYPAIR_PATH` — Path to authority keypair JSON (`src/solana-live-adapter.ts`)
- `HELIUS_API_KEY` — Optional Helius indexer API key (`src/solana-live-adapter.ts`)
- `MYCELIUM_AGENT_ID` — Agent identity for custodial wallet (`src/index.ts`)
- `MYCELIUM_SPORE_PROGRAM_ID` — Override spore program address (`src/solana-live-adapter.ts`)

**Environment — Web App:**
- `NEXT_PUBLIC_SOLANA_CLUSTER` — `devnet` or `mainnet-beta` (`app/.env.local.example`)
- `NEXT_PUBLIC_SOLANA_RPC_URL` — RPC endpoint (`app/.env.local.example`, `app/src/lib/constants.ts`)
- `.env.local` present (not committed); `.env.local.example` committed as reference

**TypeScript (`tsconfig.json`):**
- Target: ES2022
- Module: NodeNext / NodeNext resolution
- Strict mode: enabled
- Output: `dist/` from `src/`

**Anchor (`Anchor.toml`):**
- Cluster: devnet
- Wallet: `~/solana-keys/id.json`
- All four programs deployed to devnet with known program IDs

**Build:**
- `build`: `tsc` — compiles MCP server
- `dev`: `tsx src/index.ts` — dev server without pre-compilation
- `start`: `node dist/index.js` — runs compiled output

## Platform Requirements

**Development:**
- Node.js >= 20.0.0
- Rust + Cargo (for Anchor program compilation)
- Anchor CLI 0.30.x
- Solana CLI (for devnet deployment and keypair management)
- Keypair at `~/solana-keys/id.json` (configurable via `SOLANA_KEYPAIR_PATH`)

**Production:**
- Solana devnet (current) — four programs live at addresses in `Anchor.toml`
- Deployment target for web app: not explicitly configured (Next.js standard)
- MCP server distribution: `bin` entry `mycelium-mcp` in `package.json` (npm-installable CLI)

---

*Stack analysis: 2026-04-07*
