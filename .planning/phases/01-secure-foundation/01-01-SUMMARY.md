---
phase: 01-secure-foundation
plan: 01
subsystem: on-chain-programs
tags: [security, anchor, solana, schema]
dependency_graph:
  requires: []
  provides: [hardened-spore, hardened-hypha, hardened-rhizome, hardened-meridian, fail-fast-adapter]
  affects: [01-02, 01-03]
tech_stack:
  added: []
  patterns: [original_creator-immutability, content-hash-registry-pda, ed25519-instruction-parsing, platform-wallet-constraint]
key_files:
  created: []
  modified:
    - programs/mycelium-spore/src/lib.rs
    - programs/mycelium-hypha/src/lib.rs
    - programs/mycelium-hypha/Cargo.toml
    - programs/mycelium-rhizome/src/lib.rs
    - programs/mycelium-meridian/src/lib.rs
    - src/solana-live-adapter.ts
  deleted:
    - mycelium_spore_lib.rs (untracked stale file)
    - mycelium_spore_tests.ts (untracked stale file)
    - mycelium_spore_Cargo.toml (untracked stale file)
decisions:
  - "UpdateStatus constrained to ip_asset.creator (current owner) -- DRP program authority will be added in Phase 3"
  - "PROTOCOL_AUTHORITY set to deployer wallet F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye -- will become Squads multisig in Phase 4"
  - "Hypha uses owner = mycelium_spore::ID approach (CPI feature import) rather than raw pubkey string"
  - "Ed25519 verification parses full instruction data (pubkey + message) not just program_id presence check"
metrics:
  duration: "6 minutes"
  completed: "2026-04-12"
  tasks: 3
  files: 8
---

# Phase 01 Plan 01: Security Hardening Summary

All 4 Solana programs hardened against known security vulnerabilities. Spore schema extended with immutable original_creator and global ContentHashRegistry. Meridian Ed25519 verification parses instruction data to verify protocol authority pubkey and package_hash match.

## Tasks Completed

### Task 1: Harden Spore program (671c2ca)

- Added `original_creator: Pubkey` as first field in IPAsset struct (immutable after registration)
- Added `ContentHashRegistry` PDA struct with `SEED_CONTENT_HASH` constant for global content hash uniqueness
- Added `content_hash_registry` account to both `RegisterIP` and `RegisterDerivative` contexts -- duplicate content_hash from any creator is now rejected via PDA init collision
- Switched PDA seeds in `UpdateMetadata`, `TransferOwnership`, `UpdateStatus` from `ip_asset.creator` to `ip_asset.original_creator` -- PDAs remain stable after ownership transfer
- Added authority constraint on `UpdateStatus`: `authority.key() == ip_asset.creator` (SEC-01)
- Added `original_creator` field to `IPRegistered` event
- Verified `transfer_ownership` only modifies `creator`, never `original_creator`

### Task 2: Harden Hypha, Rhizome, and Meridian (2783ebf)

**Hypha (SEC-03):**
- Changed `ip_asset` in `CreateLicenseTemplate` from `UncheckedAccount` to `AccountInfo` with `owner = mycelium_spore::ID` constraint
- Added `mycelium-spore` CPI dependency in Cargo.toml

**Rhizome (SEC-04):**
- Added `platform_wallet: Pubkey` field to `RoyaltyConfig` struct
- Added `platform_wallet` parameter to `configure_royalty` function
- Added constraint in `DistributeRoyalties`: `platform_wallet.key() == royalty_config.platform_wallet`
- Added caller constraint: `caller.key() == royalty_config.creator`
- Added `RhizomeError::Unauthorized` variant

**Meridian (SEC-02):**
- Added `PROTOCOL_AUTHORITY` constant (deployer wallet pubkey)
- Added `instructions_sysvar` account to `GenerateMEP` context
- Added full Ed25519 precompile verification in `generate_mep`:
  - Loads preceding instruction, verifies `program_id == ed25519_program::ID`
  - Parses instruction data: verifies `num_signatures == 1`
  - Extracts and verifies pubkey matches `PROTOCOL_AUTHORITY`
  - Extracts and verifies signed message matches `package_hash`
- Added 4 error variants: `MissingEd25519Verification`, `InvalidEd25519InstructionData`, `InvalidProtocolAuthority`, `PackageHashMismatch`

### Task 3: Fail-fast keypair + stale file cleanup (536cbb7)

- Moved keypair validation to `SolanaLiveAdapter` constructor
- Added `existsSync` check with descriptive error for missing keypair file
- Added try/catch with clear error for invalid keypair data
- Removed lazy `loadKeypair` function -- all validation happens at startup
- Deleted 3 stale root files (untracked): `mycelium_spore_lib.rs`, `mycelium_spore_tests.ts`, `mycelium_spore_Cargo.toml`

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

1. **UpdateStatus authority = ip_asset.creator**: Constrained to current owner only. The plan noted this will expand to include DRP program authority in Phase 3.
2. **PROTOCOL_AUTHORITY as constant**: Set to deployer wallet `F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye`. Phase 4 will upgrade this to a Squads multisig.
3. **CPI import for Hypha**: Used `mycelium_spore::ID` via Cargo dependency rather than hardcoding the program ID string.
4. **Stale files were untracked**: The 3 root files were never committed to git, so deletion is a filesystem-only operation (no git rm needed).

## Known Stubs

None. All changes are complete implementations of security constraints.

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| original_creator occurrences in Spore | >= 5 | 12 |
| ContentHashRegistry occurrences in Spore | >= 3 | 5 |
| Spore owner check in Hypha | present | owner = mycelium_spore::ID |
| platform_wallet in Rhizome | present in config + constraint | 6 occurrences |
| ed25519_program in Meridian | present | 2 occurrences |
| PROTOCOL_AUTHORITY in Meridian | present | 4 occurrences |
| PackageHashMismatch in Meridian | present | 2 occurrences |
| existsSync in adapter | present | 2 occurrences |
| Stale lib.rs deleted | not exists | confirmed deleted |

## Self-Check: PASSED

All 7 modified/created files verified on disk. All 3 task commits verified in git log (671c2ca, 2783ebf, 536cbb7).
