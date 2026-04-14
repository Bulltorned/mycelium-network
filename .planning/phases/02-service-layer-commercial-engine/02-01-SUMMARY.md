---
phase: 02-service-layer-commercial-engine
plan: 01
subsystem: off-chain-infrastructure
tags: [postgresql, helius, irys, arweave, bip44, key-vault, indexer, webhook]
dependency_graph:
  requires: []
  provides: [db-pool, schema, encrypted-store, hd-derive, irys-uploader, webhook-handler, event-parser, query-layer]
  affects: [02-02, 02-03]
tech_stack:
  added: [pg, express, helius-sdk, "@irys/upload", "@irys/upload-solana", ed25519-hd-key, bip39, "@solana/spl-token", dotenv]
  patterns: [connection-pool-singleton, aes-256-gcm-encryption, bip44-hd-derivation, webhook-idempotency, parameterized-sql, upsert-on-conflict]
key_files:
  created:
    - src/services/db/pool.ts
    - src/services/db/schema.sql
    - src/services/key-vault/encrypted-store.ts
    - src/services/key-vault/hd-derive.ts
    - src/services/storage/irys-uploader.ts
    - src/services/indexer/event-parser.ts
    - src/services/indexer/webhook-handler.ts
    - src/services/indexer/queries.ts
  modified:
    - package.json
decisions:
  - "Used raw pg over Prisma ORM -- 8 tables with known schema, no migration complexity needed"
  - "Helius SDK createHelius() factory used instead of class constructor (SDK v2.2.2 API)"
  - "Event parser uses Anchor discriminator matching (SHA-256 of global:instruction_name) without full IDL deserialization -- sufficient for routing, full field decode deferred to when account data is enriched"
  - "Express 5.x installed (latest) -- webhook handler is minimal, no breaking changes relevant"
metrics:
  tasks_completed: 3
  tasks_total: 3
  files_created: 8
  files_modified: 1
  dependencies_added: 9
---

# Phase 02 Plan 01: Off-Chain Infrastructure Services Summary

PostgreSQL connection pool, 6-table schema, AES-256-GCM encrypted key vault, BIP-44 HD wallet derivation, Irys/Arweave upload pipeline, Helius webhook handler with idempotent event parsing, and parameterized SQL query layer replacing getProgramAccounts.

## What Was Built

### Database Layer (src/services/db/)
- **pool.ts**: Singleton pg.Pool with max 10 connections, SSL for cloud PG (Neon/Supabase), `query()` helper, `initDatabase()` schema loader
- **schema.sql**: 6 tables (processed_transactions, ip_assets, licenses, royalty_configs, agent_wallets, evidence_packages) with 5 indexes, all IF NOT EXISTS

### Key Vault (src/services/key-vault/)
- **encrypted-store.ts**: AES-256-GCM encryption with random 12-byte IV, stores encrypted secret keys in agent_wallets table, never logs secret material
- **hd-derive.ts**: BIP-44 derivation at path m/44'/501'/{agentIndex}'/0', auto-incrementing derivation index, integrates with encrypted store for persistence

### Storage (src/services/storage/)
- **irys-uploader.ts**: Wraps @irys/upload-solana pre-1.0 SDK in try/catch adapter, uploads metadata and evidence with Mycelium-Protocol tags, returns permanent arweave.net URIs

### Indexer (src/services/indexer/)
- **event-parser.ts**: Parses Helius enhanced transactions using Anchor instruction discriminators, routes to 4 program-specific parsers (Spore, Hypha, Rhizome, Meridian), all UPSERTs are idempotent via ON CONFLICT
- **webhook-handler.ts**: Express POST /webhooks/helius endpoint, responds 200 immediately (prevents Helius retry), checks processed_transactions for idempotency, processes inner instructions for CPI calls
- **queries.ts**: Replaces getProgramAccounts (INF-02), provides searchIPAssets with dynamic WHERE + pagination, getIPAssetByPubkey, getLicensesByIP, getProvenanceChain, getRoyaltyConfig -- all parameterized SQL

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Helius SDK API change**
- **Found during:** Task 2
- **Issue:** helius-sdk v2.2.2 exports `createHelius` factory function, not `Helius` class
- **Fix:** Changed import from `{ Helius }` to `{ createHelius }` and `new Helius()` to `createHelius()`
- **Files modified:** src/services/indexer/webhook-handler.ts

**2. [Rule 2 - Missing functionality] Hypha IDL uses issueLicense not acquireLicense**
- **Found during:** Task 2
- **Issue:** Plan referenced `acquire_license` but IDL has `issueLicense`, `revokeLicense`, `deactivateTemplate`
- **Fix:** Event parser uses actual IDL instruction names (issue_license, revoke_license, deactivate_template)
- **Files modified:** src/services/indexer/event-parser.ts

**3. [Rule 2 - Missing functionality] Inner instruction processing**
- **Found during:** Task 2
- **Issue:** CPI calls from one program to another would be missed if only top-level instructions parsed
- **Fix:** Added innerInstructions processing loop in webhook handler
- **Files modified:** src/services/indexer/webhook-handler.ts

## Known Stubs

| File | Line | Stub | Reason |
|------|------|------|--------|
| event-parser.ts | register_ip handler | content_hash uses `pending_${txSig}` placeholder | Full field decode requires IDL deserialization of instruction data bytes; sufficient for indexing, enrichment planned for 02-03 |
| event-parser.ts | create_license_template | license_type, price, royalty hardcoded to 0 | Same reason -- discriminator routing works, full field decode deferred |
| event-parser.ts | generate_mep | jurisdiction hardcoded to "GENERIC" | Same reason |
| queries.ts | getLicensesByIP | licenseType returns "open_spore" placeholder | On-chain enum decode not yet wired; index stores the SMALLINT correctly |

These stubs do NOT prevent the plan's goal (infrastructure services functional). They are data-enrichment gaps that will be resolved when the live adapter (Plan 02-02) wires full IDL account reads.

## Verification Results

- All 8 new files exist under src/services/
- package.json contains all 9 new dependencies (8 production + 1 dev type)
- schema.sql has valid DDL (6 CREATE TABLE, 5 CREATE INDEX, all IF NOT EXISTS)
- No hardcoded secrets -- all sensitive values from process.env
- Event parser uses UPSERT (ON CONFLICT DO UPDATE) for idempotent processing
- Query layer uses parameterized SQL ($1, $2) everywhere
- Key vault uses AES-256-GCM, never logs secret keys
- Irys uploader wraps pre-1.0 SDK in try/catch with descriptive errors
- TypeScript compilation: zero errors in src/services/ files
