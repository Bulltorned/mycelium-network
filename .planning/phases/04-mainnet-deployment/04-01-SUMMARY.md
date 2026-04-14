---
phase: 04-mainnet-deployment
plan: 01
subsystem: deployment-infra
tags: [solana, keypairs, mainnet, cross-program, program-ids, cost-model]
dependency_graph:
  requires: []
  provides: [mainnet-program-ids, network-aware-adapters, drp-authority-pda, registration-cost-docs]
  affects: [04-02, 04-03, all-typescript-services]
tech_stack:
  added: []
  patterns: [network-aware-env-vars, SOLANA_NETWORK-switch]
key_files:
  created:
    - docs/registration-cost.md
    - .env.example
    - C:/solana-keys/mycelium_spore-mainnet-keypair.json
    - C:/solana-keys/mycelium_hypha-mainnet-keypair.json
    - C:/solana-keys/mycelium_rhizome-mainnet-keypair.json
    - C:/solana-keys/mycelium_meridian-mainnet-keypair.json
    - C:/solana-keys/mycelium_drp-mainnet-keypair.json
  modified:
    - Anchor.toml
    - programs/mycelium-spore/src/lib.rs
    - programs/mycelium-drp/src/lib.rs
    - src/solana-live-adapter.ts
    - src/services/indexer/event-parser.ts
    - src/services/evidence/evidence-engine.ts
    - src/idl/mycelium_spore.json
    - src/idl/mycelium_hypha.json
    - src/idl/mycelium_rhizome.json
    - src/idl/mycelium_meridian.json
    - src/idl/mycelium_drp.json
    - .gitignore
    - .planning/PROJECT.md
decisions:
  - "Used real solana-keygen for mainnet keypairs (not vanity addresses) -- speed over branding"
  - "DRP declare_id set to mainnet ID (BKrUCd...) instead of keeping Anchor default placeholder"
  - "SPORE_PROGRAM_ID in DRP uses mainnet bytes -- network-specific cross-program refs require manual update when switching"
  - "SOLANA_NETWORK env var as single switch for all adapters (devnet default, mainnet-beta for production)"
  - "Devnet DRP ID (Fg6PaF) kept as devnet default in TypeScript adapters -- it's the Anchor default, not a real devnet deployment"
metrics:
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
  files_modified: 13
  completed_date: "2026-04-13"
---

# Phase 04 Plan 01: Mainnet Keypair Generation and Cross-Program ID Resolution Summary

Generated 5 mainnet program keypairs, resolved Spore-DRP circular dependency with real PDA bytes, made all TypeScript adapters network-aware via SOLANA_NETWORK env var, and corrected registration cost from $0.004 to ~$0.40.

## Mainnet Program IDs

| Program | Mainnet ID | Keypair Location |
|---------|-----------|-----------------|
| Spore | GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR | C:/solana-keys/mycelium_spore-mainnet-keypair.json |
| Hypha | BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV | C:/solana-keys/mycelium_hypha-mainnet-keypair.json |
| Rhizome | 7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW | C:/solana-keys/mycelium_rhizome-mainnet-keypair.json |
| Meridian | 2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le | C:/solana-keys/mycelium_meridian-mainnet-keypair.json |
| DRP | BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU | C:/solana-keys/mycelium_drp-mainnet-keypair.json |

## Cross-Program ID Resolution

The circular dependency between Spore and DRP was resolved:

- **DRP Authority PDA** (in Spore lib.rs): `MG5mccsiGSx2GLRoyBG4aZvUSejPGTqChxzSXJ5kAGM` (bump=255)
  - Derived from: `findProgramAddressSync([b"drp_authority"], BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU)`
  - Replaces: `[0u8; 32]` placeholder
- **SPORE_PROGRAM_ID** (in DRP lib.rs): mainnet Spore bytes
  - Replaces: devnet Spore bytes (AZGNVb...)

## Task Completion

### Task 1: Generate mainnet keypairs and resolve cross-program IDs
- Generated 5 keypairs at C:/solana-keys/ using `solana-keygen new`
- Added `[programs.mainnet-beta]` section to Anchor.toml with all 5 IDs
- Added DRP to `[programs.devnet]` section (was missing)
- Updated DRP_AUTHORITY in Spore from placeholder to real PDA bytes
- Updated SPORE_PROGRAM_ID in DRP from devnet to mainnet bytes
- Updated DRP declare_id from Anchor default (Fg6PaF) to mainnet ID
- Added keypair patterns to .gitignore

### Task 2: Update TypeScript adapters, IDLs, and registration cost docs
- Made solana-live-adapter.ts network-aware: SOLANA_NETWORK env var controls defaults, individual env var overrides per program
- Made event-parser.ts network-aware: added MERIDIAN and DRP entries (previously missing)
- Made evidence-engine.ts MERIDIAN_PROGRAM_ID env-var driven
- Updated USDC_MINT to auto-switch between devnet and mainnet based on SOLANA_NETWORK
- Added `address` field to all 5 IDL JSON files with mainnet IDs
- Created docs/registration-cost.md with accurate cost breakdown (~0.00474 SOL per registration)
- Created .env.example with all required environment variables
- Corrected PROJECT.md cost claims from $0.004 to ~$0.40

## Registration Cost Correction

| What was claimed | What it actually is | Reason |
|-----------------|-------------------|--------|
| $0.004 per registration | ~$0.40 per registration (~0.00474 SOL at $85/SOL) | $0.004 was transaction fee only. Actual cost includes rent-exempt deposits for IPAsset PDA (0.00334 SOL) + ContentHashRegistry PDA (0.00140 SOL) |

Note: Rent deposits are reclaimable if accounts are closed. Effective long-term cost is only the transaction fee (~$0.0004).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Added DRP to devnet section of Anchor.toml**
- Found during: Task 1
- Issue: DRP was missing from `[programs.devnet]` section entirely
- Fix: Added `mycelium_drp = "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS"` to devnet section
- Files modified: Anchor.toml

**2. [Rule 2 - Missing] Added keypair patterns to .gitignore**
- Found during: Task 1
- Issue: No gitignore rules for keypair files -- risk of committing secrets
- Fix: Added `mainnet-keys/` and `*-keypair.json` patterns
- Files modified: .gitignore

**3. [Rule 1 - Bug] Corrected cost claims in PROJECT.md**
- Found during: Task 2
- Issue: PROJECT.md still claimed "$0.004" registration cost
- Fix: Updated to "~$0.40 (~0.00474 SOL)"
- Files modified: .planning/PROJECT.md

## Known Stubs

None. All values are real derived program IDs and PDAs.

## Self-Check: PASSED

All 16 source files verified present. All 5 keypair files verified at C:/solana-keys/. No missing artifacts.
