---
phase: 03-ip-protection-loop
plan: 01
subsystem: evidence-engine
tags: [evidence, mep, jurisdiction, ed25519, arweave, meridian]
dependency_graph:
  requires: [irys-uploader, indexer-queries, meridian-program]
  provides: [evidence-engine, mep-assembler, jurisdiction-formatter]
  affects: [solana-live-adapter]
tech_stack:
  added: [tweetnacl]
  patterns: [canonical-json-hashing, ed25519-signing, raw-byte-upload]
key_files:
  created:
    - src/services/evidence/mep-assembler.ts
    - src/services/evidence/jurisdiction-formatter.ts
    - src/services/evidence/evidence-engine.ts
  modified:
    - src/solana-live-adapter.ts
    - package.json
decisions:
  - Canonical JSON serialization with recursive key sorting for deterministic hashing
  - uploadMEPRaw bypasses uploadEvidence to guarantee hash(bytes) === hash(uploaded_bytes)
  - Protocol authority keypair reused as requester for devnet; production will use separate keys
  - WIPO formatting triggered when asset has wipoAligned/niceClass/berneCategory metadata
metrics:
  completed: 2026-04-13
  tasks: 3
  files_created: 3
  files_modified: 2
---

# Phase 03 Plan 01: Evidence Engine Summary

MEP assembler, jurisdiction formatter, and evidence engine orchestrator producing court-ready evidence packages with Ed25519 signed SHA-256 hashes anchored on Solana via Meridian program, supporting UU ITE Pasal 5 (Indonesia) and WIPO Arbitration formats.

## What Was Built

### Task 1: MEP Assembler + Jurisdiction Formatter

**src/services/evidence/mep-assembler.ts** -- Collects IP asset data, license history, and provenance chain from the PostgreSQL indexer into a structured MEPDocument JSON. Exports `assembleMEP()`, `buildProvenanceChain()`, and `JURISDICTION_MAP`. The MEPDocument interface defines all fields needed for court submission: asset metadata, WIPO-compatible fields, license history, provenance chain, jurisdiction section, and integrity verification instructions.

**src/services/evidence/jurisdiction-formatter.ts** -- Produces jurisdiction-specific legal compliance sections. For Indonesia (UU ITE Pasal 5): full Bahasa Indonesia juridical justification covering all 4 statutory requirements for electronic evidence admissibility. For WIPO Arbitration: ECAF-compatible format with chain of custody documentation and WIPO-compatible metadata (Nice class, Berne category). Generic international format as fallback using ISO 27037:2012 standards.

**tweetnacl** added to package.json as explicit dependency for Ed25519 signing.

### Task 2a: Evidence Engine Orchestrator

**src/services/evidence/evidence-engine.ts** -- Orchestrates the full MEP generation pipeline:
1. Assemble MEP JSON via `assembleMEP()`
2. Canonical JSON serialization (recursive key sorting for deterministic output)
3. SHA-256 hash of the exact canonical byte string
4. Upload the same exact byte string to Arweave via `uploadMEPRaw()` (bypasses `uploadEvidence()` to prevent re-serialization)
5. Ed25519 sign the hash with protocol authority via `nacl.sign.detached()`
6. Build Solana transaction: Ed25519 verify instruction at index 0, `generate_mep` instruction at index 1
7. Send and confirm transaction on Meridian program

The hash consistency invariant is the critical design decision: the same bytes are hashed AND uploaded, so anyone can verify by downloading from Arweave, computing SHA-256, and comparing to the on-chain record.

### Task 2b: Live Adapter Wiring

**src/solana-live-adapter.ts** -- Updated to:
- Import and load `mycelium_meridian.json` IDL
- Initialize `meridianProgram` in constructor alongside spore/hypha/rhizome
- Replace `generateEvidence()` stub (which returned fake `sha256:ev_` hashes) with real call to `generateFullMEP()`
- All mock data removed; evidence generation now goes through full on-chain flow

## Deviations from Plan

None -- plan executed exactly as written.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| `uploadMEPRaw` over `uploadEvidence` | `uploadEvidence` calls `JSON.stringify()` internally which could produce different byte ordering than the hash computation. Raw upload guarantees hash matches uploaded bytes. |
| Recursive key-sorting in `canonicalStringify` | Simple `JSON.stringify(obj, Object.keys(obj).sort())` only sorts top-level keys. Recursive sort ensures nested objects are also deterministic. |
| WIPO triggered by asset metadata | Rather than a separate jurisdiction code, WIPO formatting is triggered when `GENERIC` jurisdiction is used with WIPO-aligned assets (niceClass/berneCategory set). |
| Protocol keypair = requester keypair for devnet | Production would use a separate multisig-controlled protocol authority. Plan explicitly allows this for devnet. |

## Verification Results

All 7 plan verification checks pass:
1. Three evidence files exist in `src/services/evidence/`
2. Zero `mock`/`fake`/`placeholder` strings in evidence files
3. Import chain verified: live adapter -> evidence-engine -> mep-assembler -> jurisdiction-formatter -> indexer queries
4. UU ITE Pasal 5 reference confirmed in jurisdiction-formatter
5. WIPO Arbitration reference confirmed in jurisdiction-formatter
6. Ed25519Program usage confirmed in evidence-engine
7. Zero `sha256:ev_` mock hashes in live adapter

## Known Stubs

None. All functions are fully implemented with real data flows. The only runtime dependencies are:
- PostgreSQL indexer (DATABASE_URL) for fetching IP asset data
- Solana RPC (SOLANA_RPC_URL) for transaction submission
- Irys/Arweave for permanent storage upload

These are infrastructure dependencies, not code stubs.
