# Mycelium Protocol — Product Requirements Document

**Version:** 1.0
**Date:** 2026-04-07
**Author:** Aji Pratomo (INFIA Group)
**Status:** Draft — Ready for technical review

---

## 1. Executive Summary

Mycelium Protocol is decentralized intellectual property infrastructure built on Solana. It provides instant, verifiable, court-admissible proof of IP creation, programmable licensing, automated royalty distribution, and jurisdiction-aware evidence packages for creators worldwide — especially those in the Global South excluded from the $730+ WIPO filing system.

**Not a token project.** No $MYCO. No speculation. Pure blockchain infrastructure.

**Core thesis:** The existing IP system (WIPO, national trademark offices) is slow, expensive, and inaccessible. Mycelium doesn't compete with WIPO — it completes it. A Solana transaction costs $0.004 and confirms in 400ms. A WIPO filing costs $730+ and takes 12-18 months.

**Target users:**
- AI agents (via MCP server) that need to verify IP ownership before using content
- Creators who need timestamped proof of creation without WIPO filing costs
- Media companies (like INFIA's 36+ IPs) that need programmatic licensing and royalty collection
- Legal teams that need court-admissible evidence packages formatted per jurisdiction

---

## 2. Problem Statement

### 2.1 The Access Gap

- 3.2 billion people in the Global South create IP daily but cannot afford to register it
- WIPO Madrid Protocol costs $730+ per registration per class per territory
- Average processing time: 12-18 months
- Result: Creators have no legal proof of creation date, no enforceable licensing, no royalty tracking

### 2.2 The AI Training Problem

- AI companies scrape creative works for training data without compensation
- Creators cannot prove prior art or enforce licensing terms programmatically
- No machine-readable way for an AI agent to check "is this content licensed for training?"

### 2.3 The Enforcement Gap

- Even with registration, enforcing IP rights across borders is prohibitively expensive
- Courts in Indonesia, Kenya, Colombia, and other Global South jurisdictions have different evidentiary standards
- No standardized evidence package format exists for blockchain-based IP proof

---

## 3. Product Vision

### 3.1 One-liner

The on-chain layer that completes WIPO — instant IP timestamping, programmable licensing, automated royalty distribution, and court-ready evidence packages.

### 3.2 Core Value

**Any creator, anywhere, can prove they made something first — for $0.004, in 400ms, with evidence that holds up in court.**

If everything else fails, this must work. Registration + timestamping is the foundation.

### 3.3 Strategic Context (INFIA Group)

Mycelium is being built as infrastructure for INFIA Group's 36+ IP portfolio (Dagelan 24M followers, Tahilalats, Hai Dudu, Mindblowon Studio, etc.) and the broader Indonesia New Media Forum (INMF) coalition of 38+ creators. First customer is internal — INFIA's own IP registration and licensing.

Mycelium is incorporated as a Singapore entity (Mycelium SG) under Aji Pratomo's personal holdings, outside the INFIA corporate structure. This is intentional — protocol infrastructure should be independent of any single media company.

---

## 4. Architecture Overview

Four Anchor programs on Solana, one MCP server, one web frontend:

```
┌─────────────────────────────────────────────────────┐
│                    AI Agents (MCP)                    │
│              Claude, GPT, Gemini, etc.               │
└────────────────────┬────────────────────────────────┘
                     │ MCP Protocol (stdio / HTTP)
┌────────────────────▼────────────────────────────────┐
│              MCP Server (TypeScript)                  │
│  13 tools · 4 resources · Zod validation             │
│  SolanaAdapter interface (mock ↔ live swap)           │
└────────────────────┬────────────────────────────────┘
                     │ @solana/web3.js RPC
┌────────────────────▼────────────────────────────────┐
│               Solana Blockchain (Devnet)              │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐│
│  │  Spore   │  │  Hypha   │  │ Rhizome  │  │Merid.││
│  │ IP Reg.  │  │Licensing │  │ Royalty  │  │Evid. ││
│  └──────────┘  └──────────┘  └──────────┘  └──────┘│
└─────────────────────────────────────────────────────┘
         │                              │
    ┌────▼────┐                   ┌─────▼─────┐
    │ Arweave │                   │  Helius   │
    │Metadata │                   │ Indexer   │
    └─────────┘                   └───────────┘
```

### 4.1 Program Breakdown

| Program | Name | Devnet ID | Purpose |
|---------|------|-----------|---------|
| `mycelium-spore` | Spore | `AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz` | IP Registration, PoH timestamping, ownership transfer |
| `mycelium-hypha` | Hypha | `9tB3hfhvFbAQDCgp8a2hVnHG8LH7Kk5bkVSLijg5pj` | License templates, license acquisition, terms enforcement |
| `mycelium-rhizome` | Rhizome | `7LrekmiXPe8doGFEPwCjQKDHMjTYfJrpjVQFfaxvYK3y` | Royalty configuration, deposit, distribution (up to 8 recipients) |
| `mycelium-meridian` | Meridian | `9HRqJ3tFGPMRH8NKy1pg5r7dPR8LjxG9ojQEoUmXpui` | Evidence Package generation (MEP), jurisdiction formatting |

### 4.2 PDA Scheme

All state is on-chain as Program Derived Addresses — no database needed:

| PDA | Seeds | Program |
|-----|-------|---------|
| IPAsset | `["ip_asset", creator_pubkey, content_hash]` | Spore |
| LicenseTemplate | `["license_template", ip_asset, licensor]` | Hypha |
| LicenseToken | `["license", template, licensee]` | Hypha |
| RoyaltyConfig | `["royalty_config", ip_asset]` | Rhizome |
| RoyaltyVault | `["royalty_vault", ip_asset]` | Rhizome |
| EvidencePackage | `["evidence", ip_asset, requester]` | Meridian |

### 4.3 On-chain IPAsset Account

```rust
pub struct IPAsset {
    pub original_creator: Pubkey,    // IMMUTABLE — PDA seed, never changes
    pub creator: Pubkey,             // Current owner — changes on transfer
    pub content_hash: [u8; 32],      // SHA-256 of original content
    pub perceptual_hash: [u8; 32],   // pHash for similarity matching
    pub ip_type: IPType,             // 11 types (literary, visual, music, etc.)
    pub metadata_uri: String,        // Arweave URI (max 128 chars)
    pub registration_slot: u64,      // Solana slot number (PoH timestamp)
    pub registration_timestamp: i64, // Unix timestamp
    pub parent_ip: Option<Pubkey>,   // Derivative chain
    pub status: IPStatus,            // Active, Disputed, Suspended, Revoked
    pub license_count: u32,
    pub dispute_count: u32,
    pub version: u16,
    pub bump: u8,
}
```

---

## 5. Current State (as of 2026-04-07)

### 5.1 What Works

| Component | Status | Notes |
|-----------|--------|-------|
| Spore program (on-chain) | **Deployed to devnet** | Registration, derivatives, metadata update, ownership transfer, status change. 11 IP types, full test suite. |
| Hypha program (on-chain) | **Deployed to devnet** | License template creation, license acquisition, verification. CC/Commercial/Exclusive/AI-Training archetypes. |
| Rhizome program (on-chain) | **Deployed to devnet** | Royalty config, deposit, distribution. Up to 8 recipients, basis-point splits, platform fee. |
| Meridian program (on-chain) | **Deployed to devnet** | MEP PDA creation, Arweave URI storage, protocol signature. 4 jurisdictions. |
| MCP Server (mock mode) | **Working** | All 13 tools functional against MockSolanaAdapter. Full in-memory simulation. |
| MCP Server (live mode) | **Partial** | `register_ip`, `search_ip`, `get_ip`, `verify_provenance`, `check_similarity`, `get_wallet` work against devnet. Licensing and disputes throw "not implemented." |
| Next.js Frontend | **Working** | Registration page, asset browser, asset detail, wallet connection (Phantom/Solflare). |
| Agent Protocol Manifests | **Declared** | A2A `agent-card.json` and UCP `ucp-manifest.json` defined. Not yet serving. |

### 5.2 What's Broken

| Issue | Severity | Details |
|-------|----------|---------|
| Schema drift between root `mycelium_spore_lib.rs` and deployed program | **CRITICAL** | Root file has `original_creator`; deployed program does not. Live adapter deserializer reads `original_creator` at offset 8, misaligning all subsequent fields. |
| Instruction discriminator mismatch | **CRITICAL** | MCP server and frontend have different hardcoded discriminator bytes for `register_ip`. One submits malformed instructions. |
| `UpdateStatus` has no authority constraint | **HIGH** | Any wallet can change any IP asset's status to Disputed/Suspended/Revoked. |
| `GenerateMEP` accepts unverified signatures | **HIGH** | Meridian stores arbitrary bytes as "protocol signature" without on-chain Ed25519 verification. |
| Hypha `ip_asset` is `UncheckedAccount` | **HIGH** | License templates can reference non-existent IP assets. |
| Rhizome `distribution_pool` unconstrained | **HIGH** | Caller-supplied address receives all distributed royalties — drainable by attacker. |
| Three duplicate Borsh deserializers | **MEDIUM** | Any struct change must be updated in 3 places with no compile-time check. |
| `perceptual_hash` is actually SHA-256 | **MEDIUM** | Frontend computes cryptographic hash, not perceptual hash. Similarity oracle only catches exact copies. |

### 5.3 What's Missing

| Feature | Priority | Blocks |
|---------|----------|--------|
| Redeploy Spore with `original_creator` field | **P0** | All live adapter operations, provenance chain, evidence packages |
| Anchor IDL client generation | **P0** | Eliminates 3 manual deserializers, discriminator bugs, schema drift |
| Hypha live adapter implementation | **P1** | All licensing MCP tools on devnet/mainnet |
| DRP (Dispute Resolution Program) | **P1** | `file_dispute` tool, authorized status changes, resolution workflow |
| Helius indexer integration | **P1** | Scalable search, provenance queries without full account scan |
| Arweave/Irys metadata upload | **P1** | Metadata storage for registered IPs |
| Similarity Oracle MVP | **P1** | Near-duplicate detection (pHash for images, Chromaprint for audio, CLIP embeddings) |
| Evidence Engine MVP | **P1** | PDF generation, jurisdiction formatting, Arweave anchoring |
| Per-agent wallet derivation | **P2** | Multi-agent key isolation (BIP-44 or Turnkey/Crossmint) |
| USDC payment integration | **P2** | License acquisition with real currency (SPL token transfers) |
| Mainnet deployment configuration | **P2** | Production launch path |
| Rhizome test suite | **P2** | Royalty distribution correctness and security verification |

---

## 6. Requirements

### 6.1 IP Registration (Spore)

| ID | Requirement | Priority |
|----|-------------|----------|
| REG-01 | Creator can register any creative work with SHA-256 content hash, metadata URI, and IP type | P0 |
| REG-02 | Registration produces immutable Solana PoH timestamp (slot + unix time) | P0 |
| REG-03 | `original_creator` field is immutable and used in PDA seeds; `creator` tracks current owner | P0 |
| REG-04 | Creator can register derivative works linked to parent IP via `parent_ip` field | P0 |
| REG-05 | Creator can transfer ownership without breaking PDA derivation | P0 |
| REG-06 | Status changes (Active→Disputed→Suspended→Revoked) restricted to protocol authority or DRP | P0 |
| REG-07 | Metadata update restricted to current owner | P1 |
| REG-08 | Duplicate content hash detection at registration time | P1 |
| REG-09 | 11 IP types supported (Literary, Visual Art, Music, Software, Character IP, Meme, Video, AI-Generated, Traditional Knowledge, Dataset, Brand Mark) | P0 |
| REG-10 | WIPO-compatible fields: Nice Classification, Berne category, country of origin | P1 |

### 6.2 Licensing (Hypha)

| ID | Requirement | Priority |
|----|-------------|----------|
| LIC-01 | IP owner can create license template with terms (type, commercial use, derivatives, AI training, price, royalty, territory, exclusivity, expiry) | P1 |
| LIC-02 | Four license archetypes: Creative Commons, Commercial, Exclusive, AI Training | P1 |
| LIC-03 | Agent or user can acquire license by paying USDC to licensor | P1 |
| LIC-04 | License verification: given IP asset + wallet, return licensed/not-licensed with details | P1 |
| LIC-05 | Maximum license issuance cap (optional, per template) | P2 |
| LIC-06 | Territory restrictions (array of ISO country codes) | P2 |
| LIC-07 | License template references verified IPAsset PDA (not arbitrary address) | P0 |

### 6.3 Royalty Distribution (Rhizome)

| ID | Requirement | Priority |
|----|-------------|----------|
| ROY-01 | IP owner configures royalty splits for up to 8 recipients (basis points, must sum to 10,000) | P1 |
| ROY-02 | Licensee deposits payment to royalty vault PDA | P1 |
| ROY-03 | Distribution is atomic: single transaction splits vault to all recipients minus platform fee | P1 |
| ROY-04 | Platform wallet is stored in RoyaltyConfig PDA and verified on distribution (not caller-supplied) | P0 |
| ROY-05 | USDC support (SPL token transfers, not just SOL) | P2 |

### 6.4 Evidence Package (Meridian)

| ID | Requirement | Priority |
|----|-------------|----------|
| EVI-01 | Generate Mycelium Evidence Package (MEP) for any registered IP asset | P1 |
| EVI-02 | MEP includes: blockchain proof, content hash verification, creator identity, license history, protocol signature | P1 |
| EVI-03 | Jurisdiction-specific formatting for Indonesia (UU ITE), Kenya (Evidence Act), Colombia (Ley 527), WIPO Arbitration | P1 |
| EVI-04 | Protocol signature verified on-chain via Ed25519 before MEP PDA creation | P0 |
| EVI-05 | MEP content stored on Arweave with permanent URI | P1 |
| EVI-06 | PDF generation with jurisdiction-appropriate headers, citations, and verification instructions | P2 |

### 6.5 Similarity Oracle

| ID | Requirement | Priority |
|----|-------------|----------|
| SIM-01 | Exact content hash match detection (Layer 1) | P0 |
| SIM-02 | Perceptual hash matching for images (pHash/dHash) and audio (Chromaprint) (Layer 2) | P1 |
| SIM-03 | Semantic embedding matching via CLIP (images), CLAP (audio), multilingual-e5 (text) (Layer 3) | P2 |
| SIM-04 | Return match candidates with score, match type, and matched layer | P1 |
| SIM-05 | Integration with registration flow: warn on similarity before confirming registration | P2 |

### 6.6 MCP Server (AI Agent Interface)

| ID | Requirement | Priority |
|----|-------------|----------|
| MCP-01 | All 13 tools functional against live Solana devnet | P0 |
| MCP-02 | Mock/live adapter swap via single env flag (`SOLANA_LIVE=1`) | P0 |
| MCP-03 | Zod schema validation on all tool inputs | P0 |
| MCP-04 | Structured error responses (`isError: true` with message) | P0 |
| MCP-05 | Agent identity from env var or OAuth token | P1 |
| MCP-06 | Per-agent custodial wallet derivation (not shared keypair) | P2 |
| MCP-07 | Streamable HTTP transport for production deployment | P2 |

### 6.7 Frontend (Web App)

| ID | Requirement | Priority |
|----|-------------|----------|
| WEB-01 | Register IP via file drop (computes hashes client-side) | P0 |
| WEB-02 | Browse registered IP assets with filtering | P1 |
| WEB-03 | Asset detail page with provenance chain | P1 |
| WEB-04 | Wallet connection (Phantom, Solflare) | P0 |
| WEB-05 | License marketplace (browse, acquire, manage licenses) | P2 |
| WEB-06 | Evidence package request and download | P2 |

### 6.8 Infrastructure

| ID | Requirement | Priority |
|----|-------------|----------|
| INF-01 | Anchor IDL client generation replacing all manual Borsh deserializers | P0 |
| INF-02 | Helius indexer integration for scalable search and event parsing | P1 |
| INF-03 | Arweave/Irys upload integration for metadata storage | P1 |
| INF-04 | Mainnet deployment configuration and program verification | P2 |
| INF-05 | CI/CD pipeline: build, test, deploy | P2 |
| INF-06 | Monitoring: RPC health, transaction success rate, account count | P2 |

---

## 7. Security Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| SEC-01 | `UpdateStatus` authority constraint (protocol authority or DRP program only) | P0 |
| SEC-02 | Meridian Ed25519 signature verification on-chain before writing MEP | P0 |
| SEC-03 | Hypha `ip_asset` field must be verified IPAsset PDA (not UncheckedAccount) | P0 |
| SEC-04 | Rhizome `platform_wallet` and recipients verified against RoyaltyConfig PDA | P0 |
| SEC-05 | Per-agent key derivation (BIP-44 or KMS) — no shared keypair | P1 |
| SEC-06 | Keypair validation at server startup (fail-fast, not fail-on-first-request) | P1 |
| SEC-07 | Rate limiting on MCP tool invocations | P2 |
| SEC-08 | Audit log for all on-chain operations via Helius webhooks | P2 |

---

## 8. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| **Latency** | IP registration: <2 seconds (Solana confirmation) |
| **Cost** | Registration: <$0.01 SOL per IP asset |
| **Availability** | MCP server: 99.9% uptime (depends on Solana RPC) |
| **Scalability** | Support 100K+ registered IP assets without degraded search |
| **Auditability** | All state changes traceable on-chain via Solana Explorer |
| **Interoperability** | MCP protocol compatible with any AI agent (Claude, GPT, Gemini) |
| **Jurisdiction** | Evidence packages formatted for Indonesia, Kenya, Colombia, WIPO |
| **Data sovereignty** | Content never goes on-chain — only hashes and Arweave URIs |

---

## 9. Deployment Targets

| Environment | Cluster | Purpose |
|-------------|---------|---------|
| Development | Local validator | Anchor tests, rapid iteration |
| Staging | Devnet | Integration testing, MCP server live mode, frontend testing |
| Production | Mainnet-beta | Live service (future — requires security audit) |

**Deployer wallet:** `F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye`

---

## 10. Success Metrics

| Metric | Target (3 months) | Target (12 months) |
|--------|-------------------|---------------------|
| IP assets registered | 1,000 (INFIA IPs + INMF coalition) | 100,000 |
| License templates created | 50 (INFIA IP licensing) | 5,000 |
| Evidence packages generated | 10 (proof of concept for legal teams) | 1,000 |
| AI agents connected via MCP | 3 (Claude, internal agents) | 50 |
| Similarity matches detected | N/A (Layer 1 only) | 10,000 near-duplicate detections |
| Jurisdictions supported | 4 (ID, KE, CO, WIPO) | 10 |
| Revenue from licensing fees | $0 (infrastructure phase) | $50K MRR |

---

## 11. Milestones

### M1: Foundation Fix (Week 1-2)

**Goal:** Make the existing codebase production-correct.

- Redeploy Spore program with `original_creator` field
- Generate Anchor IDL client, replace all manual Borsh deserializers
- Fix discriminator mismatch between MCP server and frontend
- Fix security constraints (UpdateStatus, GenerateMEP, Hypha ip_asset, Rhizome distribution)
- Add Rhizome test suite
- Delete stale `mycelium_spore_lib.rs` at root

### M2: Live Protocol (Week 3-4)

**Goal:** All MCP tools work against devnet with real Solana transactions.

- Implement Hypha live adapter (license creation, acquisition, verification)
- Implement DRP program (dispute filing, resolution workflow)
- Integrate Arweave/Irys for metadata upload
- Per-agent wallet derivation (BIP-44)
- Helius indexer integration for search and provenance

### M3: Intelligence Layer (Week 5-8)

**Goal:** Similarity detection and evidence generation are functional.

- Similarity Oracle MVP (pHash for images, Chromaprint for audio)
- Evidence Engine MVP (PDF generation, jurisdiction formatting, Arweave anchoring)
- Real perceptual hashing in frontend (replace SHA-256 stub)
- USDC payment integration for license acquisition

### M4: Production Launch (Week 9-12)

**Goal:** Mainnet deployment with INFIA's IP portfolio as first customer.

- Security audit (third-party)
- Mainnet deployment and program verification
- Register INFIA's 36+ IPs on-chain
- License marketplace frontend
- Monitoring and alerting
- MCP server published to npm as `@mycelium-protocol/mcp-server`

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Anchor struct migration breaks existing devnet accounts | High | High | Use account migration instruction; keep backward-compatible deserialization during transition |
| Solana RPC rate limits on getProgramAccounts | High | Medium | Helius DAS API integration (M2) |
| Ed25519 verification not supported in current Anchor version | Medium | High | Use `solana_program::ed25519_program` sysvar check pattern |
| USDC SPL token integration complexity | Medium | Medium | Start with SOL-only licensing; USDC in M3 |
| Perceptual hashing quality (false positives/negatives) | Medium | High | Layer 1 (exact) always runs; Layer 2/3 as confidence tiers |
| Legal admissibility of blockchain evidence challenged | Low | High | Partner with IP law firms in each jurisdiction; precedent research |
| @solana/web3.js v1→v2 migration | Medium | Medium | Defer to post-M4; v1 receives security patches |

---

## 13. Open Questions

1. **Account migration strategy:** When Spore is redeployed with `original_creator`, what happens to existing devnet accounts? Wipe devnet and re-register, or build migration instruction?

2. **DRP governance:** Who serves as arbitrator in disputes? On-chain voting (DAO-style), designated protocol authority, or integration with existing arbitration (WIPO, BANI)?

3. **Similarity Oracle hosting:** Python service (pHash, CLIP) needs GPU for embeddings. Self-hosted vs. third-party API (Pinecone, Qdrant Cloud)?

4. **Legal entity for protocol operations:** Mycelium SG (Singapore) operates the protocol authority keypair. Is this the right jurisdiction for a global IP infrastructure?

5. **Revenue model:** License fees flow through Hypha/Rhizome with platform fee. What percentage? 2.5% (Stripe-like) or 5% (marketplace-like)?

6. **INFIA IP onboarding priority:** Which of the 36+ IPs get registered first? Dagelan (largest audience), Tahilalats (most licensable character IP), or all simultaneously?

---

## 14. Glossary

| Term | Definition |
|------|-----------|
| **PDA** | Program Derived Address — deterministic Solana account derived from seeds, no private key |
| **PoH** | Proof of History — Solana's cryptographic clock, provides sub-second timestamps |
| **MEP** | Mycelium Evidence Package — court-ready dossier generated from on-chain IP data |
| **Spore** | IP Registration program (the "root" of the protocol) |
| **Hypha** | Licensing program (the "connections" between IP and licensees) |
| **Rhizome** | Royalty distribution program (the "nutrient transport" layer) |
| **Meridian** | Evidence generation program (the "boundary" with legal systems) |
| **MCP** | Model Context Protocol — Anthropic's standard for AI agent tool integration |
| **Anchor** | Solana smart contract framework (Rust) |
| **Borsh** | Binary Object Representation Serializer for Hashing — Solana's serialization format |
| **Nice Classification** | International trademark classification system (45 classes) |
| **Berne Convention** | International copyright treaty — automatic protection, no registration required |
| **UU ITE** | Indonesia's Electronic Information and Transactions Law |

---

*Document generated 2026-04-07. Based on codebase analysis, previous development sessions, and INFIA Group strategic context.*
