# Requirements: Mycelium Protocol

**Defined:** 2026-04-12
**Core Value:** Any creator, anywhere, can prove they made something first -- with evidence that holds up in court.

## v1 Requirements

Requirements for production-ready protocol. Each maps to roadmap phases.

### Security Hardening

- [x] **SEC-01**: UpdateStatus instruction constrained to protocol authority pubkey or DRP program — no arbitrary signer can change IP status *(01-01)*
- [x] **SEC-02**: Meridian GenerateMEP verifies Ed25519 protocol signature on-chain before writing EvidencePackage PDA *(01-01)*
- [x] **SEC-03**: Hypha CreateLicenseTemplate validates ip_asset is a real IPAsset PDA (not UncheckedAccount) *(01-01)*
- [x] **SEC-04**: Rhizome DistributeRoyalties verifies platform_wallet and recipients against RoyaltyConfig PDA — caller cannot supply arbitrary drain address *(01-01)*
- [x] **SEC-05**: Keypair file validated at SolanaLiveAdapter constructor startup — fail-fast, not fail-on-first-request *(01-01)*
- [ ] **SEC-06**: Squads v4 multisig configured as program upgrade authority before mainnet (2-of-3 minimum)

### Schema Alignment

- [x] **SCH-01**: Spore program redeployed with `original_creator: Pubkey` field (immutable, used in PDA seeds) separate from `creator` (current owner, mutable on transfer) *(01-01, code change — redeploy in 01-02)*
- [x] **SCH-02**: All 3 manual Borsh deserializers replaced with generated Anchor IDL client (@coral-xyz/anchor 0.30.1) *(01-02)*
- [x] **SCH-03**: Instruction discriminator mismatch between MCP server and frontend resolved via shared IDL *(01-02)*
- [x] **SCH-04**: Stale root `mycelium_spore_lib.rs` deleted — single source of truth in `programs/mycelium-spore/src/lib.rs` *(01-01)*
- [x] **SCH-05**: Account size calculation updated for `original_creator` field addition (352 bytes) *(01-01, via InitSpace derive)*
- [x] **SCH-06**: Existing devnet accounts migrated or wiped with documented decision *(01-02, decision: wipe devnet)*

### IP Registration (Spore)

- [ ] **REG-01**: Creator can register any creative work with SHA-256 content hash, metadata URI, IP type, and WIPO-compatible fields
- [ ] **REG-02**: Registration produces immutable Solana PoH timestamp (slot number + unix timestamp)
- [ ] **REG-03**: Creator can register derivative works linked to parent IP via `register_derivative` instruction
- [ ] **REG-04**: Creator can transfer ownership without breaking PDA derivation (original_creator stays in seeds)
- [x] **REG-05**: Duplicate content hash rejected at registration time *(01-01, ContentHashRegistry PDA)*
- [ ] **REG-06**: All 11 IP types supported (Literary, Visual Art, Music, Software, Character IP, Meme, Video, AI-Generated, Traditional Knowledge, Dataset, Brand Mark)

### Licensing (Hypha)

- [ ] **LIC-01**: IP owner can create license template with terms (type, price, royalty rate, territory, exclusivity, expiry, sublicensing, AI training permission)
- [ ] **LIC-02**: Four license archetypes functional: Creative Commons, Commercial, Exclusive, AI Training
- [ ] **LIC-03**: Licensee can acquire license by paying USDC to licensor via SPL token transfer
- [ ] **LIC-04**: License verification returns licensed/not-licensed with template details given IP asset + wallet
- [ ] **LIC-05**: Hypha live adapter implements createLicense, acquireLicense, verifyLicense against devnet

### Royalty Distribution (Rhizome)

- [ ] **ROY-01**: IP owner configures royalty splits for up to 8 recipients (basis points summing to 10,000)
- [ ] **ROY-02**: Deposit and distribution work with USDC (SPL token), not just SOL
- [ ] **ROY-03**: Distribution is atomic — single transaction splits vault to all recipients minus platform fee
- [ ] **ROY-04**: Rhizome program has comprehensive test suite covering config, deposit, distribution, edge cases, and security constraints

### Evidence Packages (Meridian)

- [ ] **EVI-01**: Evidence Engine generates real Mycelium Evidence Package (MEP) from any registered IP asset
- [ ] **EVI-02**: MEP includes: blockchain PoH timestamp proof, SHA-256 content hash verification, creator identity, license history, provenance chain
- [ ] **EVI-03**: MEP content uploaded to Arweave with permanent URI stored in EvidencePackage PDA
- [ ] **EVI-04**: Jurisdiction-specific formatting for Indonesia (UU ITE Pasal 5) and WIPO Arbitration at minimum

### Off-Chain Infrastructure

- [ ] **INF-01**: Helius webhook integration receives and indexes all Spore/Hypha/Rhizome/Meridian events into PostgreSQL
- [ ] **INF-02**: Helius webhook-driven PostgreSQL index replaces getProgramAccounts for search and provenance queries (DAS API does not support custom Anchor PDAs; webhook indexing into PostgreSQL achieves the same result)
- [ ] **INF-03**: Irys/Arweave upload pipeline for IP metadata — upload before on-chain registration (two-phase)
- [ ] **INF-04**: BIP-44 HD wallet derivation per agent (`m/44'/501'/{agentIndex}'/0'`) replaces shared keypair
- [ ] **INF-05**: PostgreSQL database serves indexer mirror, key vault (encrypted), and similarity hash index

### Similarity Detection

- [ ] **SIM-01**: Exact content hash match detection (Layer 1) — functional in both mock and live adapter
- [ ] **SIM-02**: Perceptual hash matching for images (pHash/dHash) via Python FastAPI sidecar service
- [ ] **SIM-03**: Audio fingerprint matching via Chromaprint in same Python sidecar
- [ ] **SIM-04**: Similarity results return match candidates with score, match type, and matched asset pubkey

### MCP Server

- [ ] **MCP-01**: All 13 MCP tools functional against live Solana devnet (no "not implemented" throws)
- [ ] **MCP-02**: Structured error responses (`isError: true`) for all failure paths
- [ ] **MCP-03**: Agent identity extracted from env var or request context — not hardcoded "default-agent"

### Dispute Resolution

- [ ] **DRP-01**: DRP program exists with file_dispute instruction creating Dispute PDA
- [ ] **DRP-02**: Dispute resolution workflow with whitelisted arbiter authority
- [ ] **DRP-03**: DRP program authorized to call Spore UpdateStatus via CPI (the only authorized caller besides protocol authority)

### Mainnet Readiness

- [ ] **MNT-01**: Mainnet-beta program IDs configured in Anchor.toml and all adapters
- [ ] **MNT-02**: Registration cost validated and documented (rent-exempt deposit + tx fee, not just tx fee)
- [ ] **MNT-03**: Verifiable build configured for all 4 programs
- [ ] **MNT-04**: Deployment runbook with rollback procedure documented

## v2 Requirements

Deferred to post-mainnet. Tracked but not in current roadmap.

### Similarity Enhancement

- **SIM-V2-01**: Semantic embedding matching via CLIP (images), CLAP (audio), multilingual-e5 (text) — Layer 3
- **SIM-V2-02**: Real-time similarity check integrated into registration flow (warn before confirming)

### Licensing Enhancement

- **LIC-V2-01**: IP pooling / bundled licensing for portfolio holders (INFIA's 36+ IPs)
- **LIC-V2-02**: Territory restrictions with ISO country code arrays
- **LIC-V2-03**: License marketplace frontend (browse, acquire, manage)

### Evidence Enhancement

- **EVI-V2-01**: PDF generation with jurisdiction-appropriate headers, citations, and verification instructions
- **EVI-V2-02**: Additional jurisdictions: Kenya (Evidence Act 106B), Colombia (Ley 527)
- **EVI-V2-03**: Integration with WIPO PROOF digital evidence service

### Platform

- **PLT-V2-01**: @solana/web3.js v1 -> v2 migration
- **PLT-V2-02**: Anchor 0.30.1 -> 1.x migration (after production track record)
- **PLT-V2-03**: MCP Streamable HTTP transport for production deployment
- **PLT-V2-04**: CI/CD pipeline with automated testing and deployment
- **PLT-V2-05**: Monitoring dashboard (RPC health, tx success rate, account count, cost tracking)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Protocol token ($MYCO) | Destroys legal credibility of evidence packages — courts scrutinize financial incentives |
| Cross-chain bridges | Bridge exploits are systemic risk; single canonical chain is safer for IP provenance |
| Mobile native app | Responsive web + MCP covers all use cases; PWA if needed |
| Real-time internet crawling for infringement | Not core competency; partner with existing services |
| Full WIPO API integration | Evidence packages formatted for manual submission; API integration is v3+ |
| DAO governance for disputes | Whitelisted arbiters are legally defensible; DAO voting is not recognized by courts |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 4 | Pending |
| SCH-01 | Phase 1 | Pending |
| SCH-02 | Phase 1 | Complete (01-02) |
| SCH-03 | Phase 1 | Complete (01-02) |
| SCH-04 | Phase 1 | Pending |
| SCH-05 | Phase 1 | Pending |
| SCH-06 | Phase 1 | Complete (01-02) |
| REG-01 | Phase 1 | Pending |
| REG-02 | Phase 1 | Pending |
| REG-03 | Phase 1 | Pending |
| REG-04 | Phase 1 | Pending |
| REG-05 | Phase 1 | Pending |
| REG-06 | Phase 1 | Pending |
| LIC-01 | Phase 2 | Pending |
| LIC-02 | Phase 2 | Pending |
| LIC-03 | Phase 2 | Pending |
| LIC-04 | Phase 2 | Pending |
| LIC-05 | Phase 2 | Pending |
| ROY-01 | Phase 2 | Pending |
| ROY-02 | Phase 2 | Pending |
| ROY-03 | Phase 2 | Pending |
| ROY-04 | Phase 2 | Pending |
| EVI-01 | Phase 3 | Pending |
| EVI-02 | Phase 3 | Pending |
| EVI-03 | Phase 3 | Pending |
| EVI-04 | Phase 3 | Pending |
| INF-01 | Phase 2 | Pending |
| INF-02 | Phase 2 | Pending |
| INF-03 | Phase 2 | Pending |
| INF-04 | Phase 2 | Pending |
| INF-05 | Phase 2 | Pending |
| SIM-01 | Phase 3 | Pending |
| SIM-02 | Phase 3 | Pending |
| SIM-03 | Phase 3 | Pending |
| SIM-04 | Phase 3 | Pending |
| MCP-01 | Phase 2 | Pending |
| MCP-02 | Phase 2 | Pending |
| MCP-03 | Phase 2 | Pending |
| DRP-01 | Phase 3 | Pending |
| DRP-02 | Phase 3 | Pending |
| DRP-03 | Phase 3 | Pending |
| MNT-01 | Phase 4 | Pending |
| MNT-02 | Phase 4 | Pending |
| MNT-03 | Phase 4 | Pending |
| MNT-04 | Phase 4 | Pending |

---
*Requirements defined: 2026-04-12*
