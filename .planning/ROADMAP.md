# Roadmap: Mycelium Protocol

## Overview

Production hardening of Mycelium Protocol from working devnet prototype to mainnet-ready IP infrastructure. The build order is dictated by security dependencies (nothing works if on-chain programs are exploitable), then data flow dependencies (indexer and storage unblock everything downstream), then the IP protection features (evidence, similarity, disputes), and finally mainnet deployment. Four phases, each delivering a coherent, verifiable capability.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Secure Foundation** - Fix all security vulnerabilities, align schemas, and verify core registration works correctly
- [ ] **Phase 2: Service Layer + Commercial Engine** - Build off-chain infrastructure and bring licensing/royalties live with USDC
- [ ] **Phase 3: IP Protection Loop** - Evidence packages, similarity detection, and dispute resolution
- [ ] **Phase 4: Mainnet Deployment** - Production configuration, multisig governance, and verified builds

## Phase Details

### Phase 1: Secure Foundation
**Goal**: On-chain programs are secure, schemas are aligned, and IP registration works correctly end-to-end with a single generated IDL client
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SCH-01, SCH-02, SCH-03, SCH-04, SCH-05, SCH-06, REG-01, REG-02, REG-03, REG-04, REG-05, REG-06
**Success Criteria** (what must be TRUE):
  1. No instruction in any program accepts an arbitrary signer where an authority constraint is required — UpdateStatus, DistributeRoyalties, GenerateMEP all enforce correct signer/PDA checks
  2. A creator can register an IP, transfer ownership, and the original_creator field remains immutable while the creator field updates — PDA derivation never breaks
  3. MCP server and frontend both use the same generated IDL client — no manual Borsh deserializers exist in the codebase, no discriminator mismatches
  4. Registering a duplicate content hash is rejected on-chain, and all 11 IP types are accepted
  5. SolanaLiveAdapter fails fast at startup if keypair is invalid — not on first request
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Security hardening: fix constraints in all 4 programs + original_creator + ContentHashRegistry + fail-fast keypair
- [x] 01-02-PLAN.md — Schema alignment: IDL generation, replace all 3 manual deserializers with IDL client, PDA helpers updated
- [ ] 01-03-PLAN.md — Registration verification: comprehensive test suites for REG-01 through REG-06, devnet redeployment checkpoint

### Phase 2: Service Layer + Commercial Engine
**Goal**: Off-chain infrastructure enables scalable search, permanent storage, and per-agent wallets; licensing and royalties work end-to-end with USDC payments
**Depends on**: Phase 1
**Requirements**: INF-01, INF-02, INF-03, INF-04, INF-05, LIC-01, LIC-02, LIC-03, LIC-04, LIC-05, ROY-01, ROY-02, ROY-03, ROY-04, MCP-01, MCP-02, MCP-03
**Success Criteria** (what must be TRUE):
  1. Search queries use Helius DAS API and return results from PostgreSQL index — getProgramAccounts is not called for search or browse operations
  2. IP metadata is uploaded to Arweave via Irys before on-chain registration, and the permanent URI is stored on-chain
  3. Each MCP agent operates with its own BIP-44 derived wallet — no shared keypair
  4. An IP owner can create a license template, a licensee can acquire it by paying USDC, and verification confirms the license exists with correct terms
  5. Royalty distribution splits a USDC deposit to all configured recipients in a single atomic transaction, with platform fee deducted
**Plans**: 3 plans

Plans:
- [ ] 02-01: Off-chain infrastructure (INF-01 through INF-05: Helius indexer, Irys storage, BIP-44 wallets, PostgreSQL)
- [ ] 02-02: Licensing + Royalties + USDC (LIC-01 through LIC-05, ROY-01 through ROY-04: Hypha live adapter, Rhizome USDC, test suite)
- [ ] 02-03: MCP server completion (MCP-01 through MCP-03: all 13 tools live, structured errors, agent identity)

### Phase 3: IP Protection Loop
**Goal**: The protocol can generate court-ready evidence, detect similar content, and resolve disputes — completing the IP protection value proposition
**Depends on**: Phase 2
**Requirements**: EVI-01, EVI-02, EVI-03, EVI-04, SIM-01, SIM-02, SIM-03, SIM-04, DRP-01, DRP-02, DRP-03
**Success Criteria** (what must be TRUE):
  1. Any registered IP asset can produce a Mycelium Evidence Package containing PoH timestamp proof, content hash verification, creator identity, license history, and provenance chain — uploaded to Arweave with permanent URI
  2. Evidence packages include jurisdiction-specific formatting for Indonesia (UU ITE Pasal 5) and WIPO Arbitration
  3. Uploading an image returns perceptual hash matches against all indexed assets with similarity scores; uploading audio returns Chromaprint matches
  4. A dispute can be filed against any IP asset, resolved by a whitelisted arbiter, and the resolution can trigger IP status changes via CPI to Spore
**Plans**: 3 plans

Plans:
- [ ] 03-01: Evidence Engine (EVI-01 through EVI-04: MEP generation, jurisdiction formatting, Arweave anchoring)
- [ ] 03-02: Similarity Oracle + Disputes (SIM-01 through SIM-04, DRP-01 through DRP-03: Python sidecar, DRP program, CPI integration)

### Phase 4: Mainnet Deployment
**Goal**: Protocol is deployed to mainnet-beta with multisig governance, verified builds, and documented operational procedures
**Depends on**: Phase 3
**Requirements**: SEC-06, MNT-01, MNT-02, MNT-03, MNT-04
**Success Criteria** (what must be TRUE):
  1. All 4 programs are deployed to mainnet-beta with program IDs configured in Anchor.toml and all adapters
  2. Squads v4 multisig (2-of-3 minimum) is the upgrade authority for all programs — no single key can modify the protocol
  3. Registration cost is validated against actual mainnet rent-exempt minimums and documented (not just transaction fee)
  4. All programs pass verifiable build — anyone can reproduce the exact deployed bytecode
  5. Deployment runbook exists with step-by-step procedure and rollback instructions
**Plans**: 3 plans

Plans:
- [ ] 04-01: Mainnet configuration + deployment (SEC-06, MNT-01 through MNT-04)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Secure Foundation | 2/3 | In progress | - |
| 2. Service Layer + Commercial Engine | 0/3 | Not started | - |
| 3. IP Protection Loop | 0/2 | Not started | - |
| 4. Mainnet Deployment | 0/1 | Not started | - |
