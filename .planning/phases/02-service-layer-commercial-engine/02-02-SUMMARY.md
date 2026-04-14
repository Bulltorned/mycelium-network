---
phase: 02-service-layer-commercial-engine
plan: 02
subsystem: commercial-engine
tags: [hypha, rhizome, licensing, royalties, usdc, spl-token, anchor-idl]
dependency_graph:
  requires: [02-01]
  provides: [hypha-live-adapter, rhizome-live-adapter, usdc-payments]
  affects: [mcp-tools, revenue-pipeline]
tech_stack:
  added: ["@solana/spl-token (getOrCreateAssociatedTokenAccount, createTransferCheckedInstruction, getAccount)"]
  patterns: [anchor-idl-client, pda-derivation, atomic-usdc-transfer, memcmp-filter]
key_files:
  created: []
  modified:
    - src/solana-live-adapter.ts
    - tests/mycelium-hypha.ts
    - tests/mycelium-rhizome.ts
decisions:
  - "Hypha IDL uses issueLicense (not acquireLicense) -- adapter maps acquireLicense to issueLicense + USDC transfer"
  - "USDC price is off-chain data (not stored in on-chain LicenseTemplate) -- template stores royaltyBps, adapter enriches with off-chain price"
  - "Territory mapping: empty array = Global, single 2-char = Country/ASEAN, multiple = Custom"
  - "Rhizome USDC distribution uses getOrCreateAssociatedTokenAccount for all recipients before distribute_royalties call"
  - "getWalletBalance now returns real USDC balance via ATA query (not SOL proxy)"
metrics:
  duration_seconds: 621
  completed: "2026-04-13T00:00:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 3
---

# Phase 2 Plan 02: Hypha Licensing + Rhizome Royalty Distribution Summary

Live Anchor IDL client integration for Hypha (createLicense, acquireLicense, verifyLicense, listLicenses) and Rhizome (configureRoyalty, depositRoyalty, distributeRoyalties) with USDC SPL token payments using 6-decimal integer lamport arithmetic.

## Tasks Completed

### Task 1: Implement Hypha live adapter with USDC

Replaced all "not implemented" throws in solana-live-adapter.ts for Hypha methods:

- **createLicense**: Derives license_template PDA, maps LicenseType/Territory to Anchor enums, calls hyphaProgram.methods.createLicenseTemplate, fetches and enriches result with off-chain data (price, territories, exclusivity)
- **acquireLicense**: Fetches template, derives license PDA, creates licensee/licensor ATAs via getOrCreateAssociatedTokenAccount, builds atomic Transaction with createTransferCheckedInstruction (6 decimals) + issueLicense instruction, sends via provider.sendAndConfirm
- **verifyLicense**: Iterates all templates for an IP asset, derives license PDA per template + wallet, attempts fetch -- first found active license = licensed
- **listLicenses**: Tries indexer (getLicensesByIP) first, falls back to hyphaProgram.account.licenseTemplate.all() with memcmp filter on ipAsset field (offset 8)
- **getProvenance**: Updated to query real licenses via listLicenses instead of empty array

Constructor now loads hyphaIdl, creates hyphaProgram Program instance, logs Hypha program ID and USDC mint on startup.

Test suite expanded from 2 to 10 test cases covering all 4 license archetypes (CreativeCommons, Commercial, Exclusive, AITraining), USDC payment flow, license verification (both licensed and unlicensed wallets), invalid royalty rate rejection, and insufficient USDC balance rejection.

### Task 2: Implement Rhizome USDC royalty distribution live adapter

Added three new public methods to SolanaLiveAdapter:

- **configureRoyalty**: Derives royalty_config PDA, maps recipients to Anchor format with role enums, calls rhizomeProgram.methods.configureRoyalty
- **depositRoyalty**: Creates depositor/vault ATAs (vault uses allowOwnerOffCurve for PDA), builds atomic Transaction with createTransferCheckedInstruction + Rhizome deposit_royalty instruction
- **distributeRoyalties**: Fetches RoyaltyConfig for recipients/platform wallet, ensures all ATAs exist via getOrCreateAssociatedTokenAccount, calls rhizomeProgram.methods.distributeRoyalties

Constructor now loads rhizomeIdl, creates rhizomeProgram Program instance.

**getWalletBalance** updated: now queries real USDC SPL token balance via ATA lookup instead of returning SOL balance as proxy. Returns dollar amount (lamports / 1_000_000).

Test suite expanded from 9 to 16 test cases. 7 new USDC-specific tests: USDC vault deposit, 3-recipient distribution with correct splits, platform fee deduction verification, 8-recipient USDC configuration, zero-balance distribution rejection, proportional amount verification (integer arithmetic), and full end-to-end lifecycle (configure -> deposit -> distribute -> verify).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hypha IDL instruction name mismatch**
- **Found during:** Task 1 Step 3
- **Issue:** Plan specified `acquireLicense` instruction but Hypha IDL has `issueLicense` (licensor-initiated, not licensee self-service)
- **Fix:** acquireLicense adapter method calls issueLicense with USDC transfer in same atomic transaction
- **Files modified:** src/solana-live-adapter.ts

**2. [Rule 2 - Missing functionality] Import for removed service modules**
- **Found during:** Task 1 Step 1
- **Issue:** Previous adapter version imported irys-uploader and hd-derive services that may not exist; the file had already been modified by a linter/prior edit
- **Fix:** Removed dead imports, kept only required dependencies
- **Files modified:** src/solana-live-adapter.ts

## Key Metrics

| Metric | Value |
|--------|-------|
| Adapter lines | 1,084 (was 579) |
| Hypha test cases | 10 (was 2) |
| Rhizome test cases | 16 (was 9) |
| Total test cases | 26 |
| "Not implemented" remaining | 1 (DRP only -- Phase 3) |
| USDC decimal handling | Integer lamports only (6 decimals, no floats) |

## Known Stubs

- `fileDispute` / `getDispute` -- DRP program is Phase 3, intentionally stubbed
- `generateEvidence` -- Evidence Engine is out of scope for this plan, returns mock URLs
- License price storage is off-chain only (on-chain template has royaltyBps but not priceUsdc); indexer handles this

## Self-Check: PASSED

All 3 modified files verified present on disk. No commits made (per instructions).
