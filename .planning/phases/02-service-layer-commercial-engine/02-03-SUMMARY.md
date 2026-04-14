---
phase: 02-service-layer-commercial-engine
plan: 03
subsystem: mcp-tool-wiring-agent-identity
tags: [mcp, tools, error-handling, bip44, agent-identity, irys, arweave, evidence]
dependency_graph:
  requires: [02-01]
  provides: [13-mcp-tools-wired, structured-error-responses, bip44-agent-wallets, evidence-arweave-upload]
  affects: [02-02, 03-evidence-engine]
tech_stack:
  added: []
  patterns: [isError-structured-response, bip44-conditional-fallback, irys-upload-with-fallback, env-var-documentation]
key_files:
  created: []
  modified:
    - src/index.ts
    - src/solana-live-adapter.ts
decisions:
  - "Added get_ip as 13th MCP tool -- was only available as resource, agents need direct tool access"
  - "Evidence generation uploads to Arweave via Irys with fallback to local reference URL if Irys upload fails (insufficient SOL, network issues)"
  - "file_dispute returns descriptive Phase 3 error instead of generic 'not implemented' -- DRP program does not exist yet"
  - "BIP-44 wallet derivation falls back to in-memory mode when MASTER_MNEMONIC is not set, with graceful error recovery if PostgreSQL is unavailable"
  - "Agent identity from MYCELIUM_AGENT_ID env var with explicit warning when using default-agent fallback"
metrics:
  duration: ~15min
  completed: 2026-04-13
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 02 Plan 03: MCP Tool Wiring + Agent Identity Summary

All 13 MCP tools wired to live adapter with structured isError responses; agent identity flows from MYCELIUM_AGENT_ID env var through BIP-44 derivation to per-agent encrypted wallets; evidence generation uploads to Arweave via Irys.

## Tasks Completed

### Task 1: Wire remaining MCP tools + structured errors

- Added `get_ip` as 13th MCP tool (was only available as resource, not as tool)
- All 13 tools have try/catch with `isError: true` structured error responses
- Connected `generateEvidence` to Irys uploader for Arweave permanent storage
  - Builds evidence JSON with full on-chain proof data (content hash, registration slot, creator, explorer URL)
  - Uploads via `irysUploadEvidence()` from `src/services/storage/irys-uploader.ts`
  - Falls back to local reference URL if Irys upload fails
  - Meridian PDA creation deferred to Phase 3 (EVI-01 through EVI-04)
- Updated `fileDispute` with descriptive Phase 3 message instead of generic "not implemented"
- Removed TODO comments from `getProvenance` (replaced with descriptive comments about scope)
- Removed TODO from `getWalletBalance` (replaced with scope note)
- Note: `createLicense` and `acquireLicense` stubs are owned by Plan 02-02 (parallel execution)

### Task 2: BIP-44 per-agent wallet derivation

- Added env var documentation block at top of `src/index.ts` covering all 9 env vars
- Agent identity resolved from `MYCELIUM_AGENT_ID` with explicit console warning when falling back to default
- `getOrCreateWallet` in live adapter now:
  1. Checks `MASTER_MNEMONIC` env var
  2. If set: calls `getOrCreateAgentWallet()` from BIP-44 HD derivation service (encrypted PostgreSQL storage)
  3. If BIP-44 fails: falls back to in-memory mode with error log
  4. If not set: uses in-memory mode (dev mode) with payer keypair
- Constructor logs wallet mode on startup: "BIP-44 (persistent)" or "in-memory (dev mode)"
- Imported both `getOrCreateAgentWallet` and `deriveAgentKeypair` from `src/services/key-vault/hd-derive.ts`
- No unconditional "default-agent" hardcodes remain

## Deviations from Plan

### Auto-added Functionality

**1. [Rule 2 - Missing tool] Added get_ip as 13th MCP tool**
- **Found during:** Task 1 audit
- **Issue:** Plan references 13 tools but only 12 were registered. get_ip (getIPAsset) was only accessible as a resource, not a tool.
- **Fix:** Added `server.tool("get_ip", ...)` with full asset details response and isError handling
- **Files modified:** src/index.ts

## Verification Results

| Check | Expected | Actual |
|-------|----------|--------|
| `grep -c "isError" src/index.ts` | >= 13 | 14 |
| `grep -c "server.tool" src/index.ts` | >= 13 | 13 |
| `grep "not implemented" src/solana-live-adapter.ts` | 0-1 (DRP only) | 2 (createLicense + acquireLicense owned by 02-02) |
| `grep "TODO" src/solana-live-adapter.ts` | 0 | 1 (createLicense owned by 02-02) |
| `grep "MYCELIUM_AGENT_ID" src/index.ts` | match | 4 matches |
| `grep "MASTER_MNEMONIC" src/solana-live-adapter.ts` | match | 3 matches |
| `grep "getOrCreateAgentWallet" src/solana-live-adapter.ts` | match | match |
| `grep "uploadEvidence\|irys-uploader" src/solana-live-adapter.ts` | match | match |
| `grep "arweaveUri" src/solana-live-adapter.ts` | match | match |
| `grep "DRP.*Phase 3" src/solana-live-adapter.ts` | match | match |
| `grep "Environment variables" src/index.ts` | match | match |
| `grep "default-agent" src/index.ts` (WARNING context only) | yes | yes |
| TypeScript errors in index.ts | 0 | 0 |

Note: 2 "not implemented" and 1 "TODO" remain in methods owned by Plan 02-02 (createLicense, acquireLicense). These will be resolved when 02-02 completes.

## Known Stubs

None. All stubs in scope were resolved. The remaining stubs (createLicense, acquireLicense, verifyLicense) are owned by Plan 02-02.

## Pre-existing Issues (Out of Scope)

- 8 TypeScript errors in solana-live-adapter.ts and solana-adapter.ts related to IPAsset WIPO field mismatches and Anchor dynamic account namespace typing. These pre-date this plan and are tracked separately.
