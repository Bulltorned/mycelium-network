# Codebase Structure

**Analysis Date:** 2026-04-07

## Directory Layout

```
mycelium-network/                        # Repo root
├── programs/                            # Solana on-chain programs (Rust/Anchor)
│   ├── mycelium-spore/src/lib.rs        # IP Registration & Proof of Existence
│   ├── mycelium-hypha/src/lib.rs        # Programmable Licensing
│   ├── mycelium-rhizome/src/lib.rs      # Royalty Distribution Engine
│   └── mycelium-meridian/src/lib.rs     # WIPO Evidence Module
├── src/                                 # MCP server (TypeScript/Node)
│   ├── index.ts                         # MCP server entry point — 11 tools, 4 resources
│   ├── solana-adapter.ts                # SolanaAdapter interface + MockSolanaAdapter
│   ├── solana-live-adapter.ts           # SolanaLiveAdapter (production, real RPC calls)
│   └── types.ts                        # Shared types mirroring on-chain account structs
├── app/                                 # Next.js frontend
│   ├── src/
│   │   ├── app/                         # Next.js App Router pages
│   │   │   ├── page.tsx                 # Home / protocol overview
│   │   │   ├── layout.tsx               # Root layout (wallet providers)
│   │   │   ├── globals.css
│   │   │   ├── register/page.tsx        # IP registration form
│   │   │   ├── assets/                  # Asset browser
│   │   │   └── asset/[pubkey]/          # Individual asset detail
│   │   ├── components/
│   │   │   ├── wallet/wallet-provider.tsx  # Phantom/Solflare wallet context
│   │   │   ├── layout/                  # Header, Footer
│   │   │   ├── register/                # Registration form components
│   │   │   ├── assets/                  # Asset list components
│   │   │   └── detail/                  # Asset detail components
│   │   ├── hooks/
│   │   │   ├── use-register-ip.ts       # Registration hook (PDA derivation + tx build)
│   │   │   └── use-my-assets.ts         # Asset fetching hook
│   │   └── lib/
│   │       ├── constants.ts             # Program IDs, PDA seeds, cluster URL
│   │       ├── pda.ts                   # PDA derivation helpers for all 4 programs
│   │       ├── hash.ts                  # Client-side SHA-256 + perceptual hash via Web Crypto
│   │       ├── types.ts                 # Frontend-specific types and enums
│   │       ├── format.ts                # URL formatters, file size, etc.
│   │       └── idl/                     # Anchor IDL JSON files (if generated)
│   └── public/
├── tests/                               # Anchor integration tests
│   ├── mycelium-spore.ts                # Spore program tests
│   ├── mycelium-hypha.ts                # Hypha program tests
│   └── mycelium-meridian.ts             # Meridian program tests
├── docs/
│   ├── Mycelium_Legal_Integration_Playbook.md
│   ├── mycelium-litepaper-v2.docx
│   ├── mycelium-pitch-v2.docx
│   └── mycelium-poc-spec-v2.docx
├── dist/                                # Compiled MCP server output (tsc)
├── target/                              # Rust/Anchor build output (gitignored)
├── migrations/                          # (Directory exists, empty)
├── agent-card.json                      # A2A agent card (skill declarations)
├── ucp-manifest.json                    # Universal Commerce Protocol manifest
├── Anchor.toml                          # Anchor config — program IDs, cluster, test script
├── Cargo.toml                           # Rust workspace (4 member programs)
├── package.json                         # MCP server Node package
├── tsconfig.json                        # TypeScript config for MCP server
└── README.md
```

## Directory Purposes

**`programs/`:**
- Purpose: All Solana on-chain code. Four Anchor programs, each in its own crate.
- Contains: One `src/lib.rs` per program — program module, account structs, instruction contexts, events, errors, constants
- Key files:
  - `programs/mycelium-spore/src/lib.rs` — declares `AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz`
  - `programs/mycelium-hypha/src/lib.rs` — declares `9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5`
  - `programs/mycelium-rhizome/src/lib.rs` — declares `9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu`
  - `programs/mycelium-meridian/src/lib.rs` — declares `7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc`

**`src/` (MCP server):**
- Purpose: Node.js MCP server — the AI agent interface to the protocol
- Contains: Entry point, adapter interface + implementations, shared TypeScript types
- Compiled to: `dist/` via `tsc`

**`app/` (Next.js frontend):**
- Purpose: Human-facing web UI for IP registration and browsing
- Contains: Full Next.js App Router project with its own `node_modules`, `package.json`, `.next/` build cache
- Note: `app/` is a self-contained project — run `npm install` and `npm run dev` from inside `app/`, not from root

**`tests/`:**
- Purpose: Anchor TypeScript integration tests against a live or local Solana validator
- Contains: One test file per program (Spore, Hypha, Meridian — Rhizome test not yet created)
- Run via: `anchor test` (spins up local validator or uses devnet per `Anchor.toml`)

## Key File Locations

**Entry Points:**
- `src/index.ts`: MCP server — run with `node dist/index.js` or `tsx src/index.ts`
- `app/src/app/layout.tsx`: Next.js root layout
- `app/src/app/page.tsx`: Home page

**Configuration:**
- `Anchor.toml`: Program IDs for devnet, cluster setting, test script command, wallet path (`~/solana-keys/id.json`)
- `Cargo.toml`: Rust workspace members
- `package.json` (root): MCP server `@mycelium-protocol/mcp-server`, build/start/dev scripts
- `app/src/lib/constants.ts`: Program IDs and PDA seeds mirrored for frontend use
- `tsconfig.json` (root): MCP server TypeScript config (ESM, Node target)

**Core Logic:**
- `src/solana-adapter.ts`: The `SolanaAdapter` interface — the contract everything is built against
- `src/types.ts`: All shared TypeScript types — `IPAsset`, `LicenseTemplate`, `EvidencePackage`, etc.
- `app/src/lib/pda.ts`: PDA derivation for all 4 programs — used by both hooks and anywhere PDAs are needed
- `app/src/lib/hash.ts`: Client-side hashing — this is what runs before any registration

**Testing:**
- `tests/mycelium-spore.ts`: Most complete test coverage (registration, derivative, ownership transfer, status update)
- `tests/mycelium-hypha.ts`: Licensing tests
- `tests/mycelium-meridian.ts`: Evidence package tests

## Naming Conventions

**Files:**
- Anchor programs: kebab-case directory name matching workspace member (`mycelium-spore`, `mycelium-hypha`)
- MCP server TypeScript: kebab-case (`solana-adapter.ts`, `solana-live-adapter.ts`)
- Next.js components: kebab-case directories, PascalCase component files (e.g., `wallet-provider.tsx` exports `SolanaProviders`)
- React hooks: `use-[noun]-[verb].ts` pattern (`use-register-ip.ts`, `use-my-assets.ts`)

**Directories:**
- Solana programs: `mycelium-{program-name}/` prefixed with protocol name
- App Router pages: noun-only (`register/`, `assets/`, `asset/`)
- Components: noun-only, matching feature domain (`wallet/`, `register/`, `assets/`, `detail/`)

**Rust identifiers:**
- Program IDs: `declare_id!("...")` at top of every `lib.rs`
- Account structs: PascalCase (`IPAsset`, `LicenseTemplate`, `RoyaltyConfig`, `EvidencePackage`)
- Enums: PascalCase variants (`IPType::VisualArt`, `IPStatus::Active`)
- Seed constants: SCREAMING_SNAKE_CASE bytes (`SEED_IP_ASSET`, `MAX_URI_LENGTH`)

**TypeScript identifiers:**
- Types/interfaces: PascalCase (`IPAsset`, `SolanaAdapter`, `RegisterIPParams`)
- Functions: camelCase (`registerIP`, `findIPAssetPDA`, `hashFile`)
- Constants: camelCase objects for grouping (`PROGRAM_IDS.spore`, `SEEDS.IP_ASSET`)

## Where to Add New Code

**New Solana instruction (to an existing program):**
- Add instruction function inside `#[program]` module in `programs/{name}/src/lib.rs`
- Add `#[derive(Accounts)]` struct for the instruction context
- Add any new `#[account]` structs needed
- Add `#[event]` for the instruction
- Add error variants to `#[error_code]` enum if needed
- Mirror new account types in `src/types.ts`
- Add new method to `SolanaAdapter` interface in `src/solana-adapter.ts`
- Implement in both `MockSolanaAdapter` (in same file) and `SolanaLiveAdapter` (`src/solana-live-adapter.ts`)
- Add corresponding MCP tool in `src/index.ts`
- Add PDA helper in `app/src/lib/pda.ts` if new PDA is introduced

**New MCP tool (no new on-chain instruction):**
- Add to `SolanaAdapter` interface in `src/solana-adapter.ts`
- Implement in `MockSolanaAdapter` and `SolanaLiveAdapter`
- Register tool in `src/index.ts` with `server.tool(name, description, zodSchema, handler)`

**New frontend page:**
- Create directory + `page.tsx` under `app/src/app/`
- Add hook in `app/src/hooks/use-[feature].ts` if it needs Solana interaction
- Use `findIPAssetPDA` / other PDA helpers from `app/src/lib/pda.ts` for account derivation
- Build raw instruction manually (encode discriminator + Borsh) until IDL client is added

**New IP type or license type:**
- Add variant to Rust enum in `programs/mycelium-spore/src/lib.rs` (`IPType`) or `programs/mycelium-hypha/src/lib.rs` (`LicenseType`)
- Add to `IPType` union in `src/types.ts`
- Add to `IP_TYPE_MAP` array in `src/solana-live-adapter.ts` (must match enum index)
- Add to `IP_TYPE_INDEX` map in `app/src/hooks/use-register-ip.ts`
- Add to Zod enum in `src/index.ts`

**New on-chain program:**
- Create `programs/mycelium-{name}/src/lib.rs` and matching `Cargo.toml`
- Add to workspace `members` in root `Cargo.toml`
- Add program ID to `Anchor.toml` `[programs.devnet]` section
- Add program ID to `app/src/lib/constants.ts` `PROGRAM_IDS`
- Add PDA helpers to `app/src/lib/pda.ts`
- Extend `SolanaAdapter` interface

**Utilities (shared helpers):**
- MCP server utilities: `src/` alongside other modules
- Frontend utilities: `app/src/lib/` (formatting, hashing, PDA derivation, constants)

## Special Directories

**`target/`:**
- Purpose: Rust build artifacts, compiled programs, Anchor IDL outputs
- Generated: Yes — by `anchor build` and `cargo build`
- Committed: No (gitignored)
- Key output: `target/types/mycelium_spore.ts` — generated TypeScript IDL types used by test suite

**`dist/`:**
- Purpose: Compiled JavaScript output for the MCP server
- Generated: Yes — by `tsc` (`npm run build`)
- Committed: No (should be gitignored)

**`app/.next/`:**
- Purpose: Next.js build cache and server output
- Generated: Yes
- Committed: No (gitignored)

**`.planning/codebase/`:**
- Purpose: Architecture and convention documents for AI-assisted development
- Generated: By Claude map-codebase commands
- Committed: Yes

---

*Structure analysis: 2026-04-07*
