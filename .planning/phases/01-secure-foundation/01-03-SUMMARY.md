---
phase: 01-secure-foundation
plan: 03
subsystem: registration-verification
tags: [tests, anchor, typescript, security, schema-alignment]
dependency_graph:
  requires: [01-01, 01-02]
  provides: [spore-test-suite, rhizome-test-suite, aligned-typescript-types]
  affects: []
tech_stack:
  added: []
  patterns: [anchor-workspace-test, content-hash-pda-derivation, royalty-config-pda]
key_files:
  created:
    - tests/mycelium-rhizome.ts
  modified:
    - src/types.ts
    - tests/mycelium-spore.ts
  deleted: []
decisions:
  - "Spore tests use string-based content hashing for deterministic unique PDAs per test case"
  - "Rhizome tests cross-reference Spore program for IP asset registration (required for royalty config)"
  - "TypeScript types extended with WIPO fields, ContentHashRegistry, and Rhizome types to match on-chain schema"
metrics:
  duration: "5 minutes"
  completed: "2026-04-12 (Task 1 only -- checkpoint pending)"
  tasks: 1/2
  files: 3
---

# Phase 01 Plan 03: Registration Verification Summary

Comprehensive test suites covering all 6 registration requirements (REG-01 through REG-06) and security constraints (SEC-01, SEC-04). TypeScript types updated with WIPO fields, ContentHashRegistry, and Rhizome types. Checkpoint reached -- devnet redeployment required before tests can execute.

## Tasks Completed

### Task 1: Update TypeScript types and write comprehensive Spore + Rhizome test suites (f369a3b)

**A. src/types.ts updates:**
- Added WIPO fields to IPAsset: `niceClass`, `berneCategory`, `countryOfOrigin`, `firstUseDate`, `wipoAligned`, `bump`
- Added `ContentHashRegistry` interface (contentHash, ipAsset, bump)
- Added `RecipientRole` type, `RoyaltyRecipient` interface, `RoyaltyConfig` interface

**B. tests/mycelium-spore.ts (17 test cases):**
- REG-01: Register IP with all fields (SHA-256 hash, metadata URI, IP type, WIPO fields, ContentHashRegistry verification)
- REG-01: Register with all WIPO fields populated (niceClass, berneCategory, firstUseDate)
- REG-01: Reject zero content hash
- REG-01: Reject empty metadata URI
- REG-02: PoH timestamp verification (slot > 0, timestamp > 2020)
- REG-03: Register derivative linked to parent IP
- REG-03: Reject derivative of non-active parent
- REG-04: Transfer ownership with original_creator immutability
- REG-04: PDA still resolves using original_creator after transfer
- REG-04: Reject transfer from non-owner
- REG-05: Reject duplicate content hash from different creator (global uniqueness via ContentHashRegistry)
- REG-05: Reject duplicate content hash from same creator (PDA collision)
- REG-06: All 11 IP types (literaryWork, visualArt, music, software, characterIp, meme, video, aiGenerated, traditionalKnowledge, dataset, brandMark)
- SEC-01: Reject UpdateStatus from non-owner
- SEC-01: Allow UpdateStatus from owner (Active -> Disputed)
- SEC-01: Reject invalid status transition (Active -> Suspended)
- Evidence chain verification (full evidence package output)

**C. tests/mycelium-rhizome.ts (9 test cases):**
- configure_royalty: Creates RoyaltyConfig PDA with correct recipients and platform_wallet
- configure_royalty: Rejects splits not summing to 10000 bps
- configure_royalty: Rejects platform fee exceeding 10%
- deposit_royalty: Deposits SOL into vault
- deposit_royalty: Rejects zero deposit
- distribute_royalties: Distributes with correct platform fee deduction
- SEC-04: Rejects distribution with wrong platform_wallet
- SEC-04: Rejects distribution from unauthorized caller
- Edge case: Supports maximum 8 recipients

### Task 2: CHECKPOINT -- Devnet redeployment required

**Status:** PAUSED at checkpoint:human-verify

Programs must be redeployed to devnet with the Plan 01-01 Rust changes (original_creator, ContentHashRegistry, authority constraints) before tests can execute. Solana CLI is not installed on this Windows 11 machine.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] IPAsset type missing WIPO and bump fields**
- **Found during:** Task 1A
- **Issue:** The IPAsset interface in src/types.ts was missing `niceClass`, `berneCategory`, `countryOfOrigin`, `firstUseDate`, `wipoAligned`, and `bump` fields that exist in the on-chain struct
- **Fix:** Added all 6 missing fields to match the Rust IPAsset struct exactly
- **Files modified:** src/types.ts

**2. [Rule 2 - Missing] Existing tests missing contentHashRegistry account**
- **Found during:** Task 1B
- **Issue:** The existing mycelium-spore.ts tests did not include the `contentHashRegistry` account in RegisterIP/RegisterDerivative calls, which was added in Plan 01-01
- **Fix:** Added `findContentHashRegistryPDA` helper and included the account in all registration calls
- **Files modified:** tests/mycelium-spore.ts

## Decisions Made

1. **String-based content hashing**: Each test uses a unique string as content hash input, ensuring deterministic and collision-free PDAs across tests.
2. **Cross-program test setup**: Rhizome tests import and use the Spore program for IP asset registration, since royalty configs require an existing IP asset PDA.
3. **WIPO type alignment**: Added all 6 missing WIPO fields to TypeScript IPAsset to fully match the on-chain struct field order.

## Known Stubs

None. All test cases contain complete implementations with assertions. Tests cannot execute until devnet redeployment, but the test code itself is complete.

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| originalCreator in types.ts | >= 1 | 1 |
| ContentHashRegistry in types.ts | >= 2 | 2 (interface + field) |
| interface ContentHashRegistry in types.ts | present | present |
| it() blocks in mycelium-spore.ts | >= 10 | 17 |
| it() blocks in mycelium-rhizome.ts | >= 4 | 9 |
| originalCreator refs in spore tests | >= 3 | 12 |
| duplicate content hash test present | yes | 6 refs |
| Unauthorized in spore tests | >= 1 | 2 |
| All 11 IP types in spore tests | 11 | 11 (in loop) |
| registerDerivative in spore tests | >= 1 | 3 |
| platform_wallet/Unauthorized in rhizome | >= 2 | 16 |
| mycelium-rhizome.ts exists | yes | yes |

## Self-Check: PASSED

All 3 task files verified on disk (src/types.ts, tests/mycelium-spore.ts, tests/mycelium-rhizome.ts). Task 1 commit verified in git log (f369a3b). Task 2 is a checkpoint -- paused for human verification (devnet redeployment).
