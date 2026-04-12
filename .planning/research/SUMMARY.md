# Project Research Summary

**Project:** Mycelium Protocol -- Production Hardening
**Domain:** On-chain IP infrastructure protocol (Solana/Anchor) with off-chain services
**Researched:** 2026-04-12
**Confidence:** MEDIUM-HIGH

## Executive Summary

Mycelium is a Solana-based IP registration, licensing, royalty, and evidence protocol with 4 Anchor 0.30.1 programs deployed on devnet, a TypeScript MCP server (13 tools), and a Next.js 14 frontend. The codebase is functionally broad but riddled with security vulnerabilities that would be exploitable on mainnet: unconstrained authorities on critical instructions, unverified Ed25519 signatures in evidence packages, and cross-program account references that accept arbitrary addresses. The protocol core differentiator -- court-ready evidence packages at $0.004/registration -- is currently a placeholder with no actual evidence generation, no Arweave uploads, and no jurisdiction-specific formatting. The good news: the on-chain program architecture is sound, the MCP agent interface is ahead of competitors, and the feature set (11 IP types, no token, sub-cent cost) positions Mycelium well against Story Protocol for Global South markets.

The recommended approach is a strict three-milestone production hardening: (M1) fix all security vulnerabilities and schema misalignments before writing another feature, (M2) build the off-chain service layer (indexer, storage, evidence engine, similarity oracle, key vault) that makes the on-chain programs actually usable, (M3) mainnet deployment with multisig governance, cost validation, and legal review of evidence packages. The stack stays on Anchor 0.30.1, web3.js v1, Next.js 14 -- no upgrades until post-mainnet. New additions are Helius (indexing/webhooks), Irys (Arweave uploads), BIP-44 HD wallets (per-agent keys), and a Python FastAPI sidecar (perceptual hashing).

The existential risk is the evidence engine. If the Ed25519 signature verification remains fake (currently accepts any 64 bytes), if the original_creator field is misaligned, or if jurisdiction formatting is wrong, the entire value proposition collapses -- courts will reject the evidence, and Mycelium becomes just another blockchain timestamp service. Security hardening is not optional pre-work; it IS the product.

## Key Findings

### Recommended Stack

The stack is brownfield -- 4 programs already deployed, so the question is what to keep, what to add, and what to leave alone. The core decision is to stay on Anchor 0.30.1 despite 1.0.0 being released 10 days ago. Upgrading Anchor mid-production would require redeploying all 4 programs due to breaking discriminator changes, and 1.0.0 has zero production track record. The Anchor IDL client (@coral-xyz/anchor@0.30.1) replaces all 3 manual Borsh deserializers and fixes the discriminator mismatch between MCP server and frontend -- this is the single highest-ROI change in the entire project.

**Core technologies:**
- **Anchor 0.30.1 (STAY):** On-chain framework -- programs deployed and working, upgrade path documented for post-mainnet
- **@coral-xyz/anchor 0.30.1 (TS client):** IDL-based typed client -- eliminates manual Borsh deserialization bugs
- **@solana/web3.js v1 (STAY):** Anchor 0.30.x incompatible with v2; no benefit to mixing
- **Helius (RPC + Webhooks + DAS):** Production indexing -- replaces unbounded getProgramAccounts scans
- **Irys/Arweave:** Permanent metadata storage -- court evidence needs immutability, not mutability
- **BIP-44 HD key derivation:** Per-agent wallets from single master seed -- replaces shared keypair anti-pattern
- **Squads v4 multisig:** Program upgrade authority on mainnet -- non-negotiable for legal credibility
- **Next.js 14 + React 18 (STAY):** Frontend already working, no reason to upgrade mid-push

### Expected Features

**Must have (table stakes):**
- IP registration with content hash + timestamp (working, needs schema fix)
- original_creator immutable field (broken -- field exists in Rust but not in deployed program)
- License template creation + acquisition + verification (Hypha live adapter throws on all operations)
- USDC payment integration (SOL-only is non-starter for commercial licensing)
- Royalty configuration + automated distribution (Rhizome has unconstrained distribution pool -- security bug)
- Evidence package generation with PoH timestamp, content hash proof, provenance chain (placeholder only)
- Arweave metadata upload (currently returns fake paths)
- Dispute filing + resolution with whitelisted arbiters
- UpdateStatus authority constraint fix (anyone can currently revoke any IP)
- Helius indexer for search (current getProgramAccounts breaks at ~1K assets)
- Per-agent wallet derivation via BIP-44
- Ed25519 signature verification fix in Meridian

**Should have (differentiators):**
- Court-ready evidence packages with jurisdiction-specific formatting (Indonesia + WIPO minimum)
- Perceptual hash similarity detection (pHash for images, Chromaprint for audio)
- MCP-native agent interface (13 tools already functional, ahead of Story Protocol)
- No-token pure infrastructure model (legal credibility advantage)
- Sub-cent registration cost ($0.004 vs Story Protocol $1-10+ EVM gas)

**Defer (v2+):**
- Semantic similarity (CLIP/CLAP embeddings) -- premature, wait for pHash validation
- Cross-chain bridges -- bridge exploits are systemic risk, single canonical chain is safer
- Real-time infringement monitoring / internet crawling -- not core competency
- Mobile app -- PWA or responsive web covers the use case
- Protocol token ($MYCO) -- destroys legal credibility of evidence packages

### Architecture Approach

The architecture is a gateway-service-state stack: MCP Server as stateless gateway, 5 off-chain services (indexer, storage, similarity oracle, evidence engine, key vault), and a 3-layer state backend (Solana PDAs, Arweave permanent storage, PostgreSQL disposable index). The iron rule is that Solana is the source of truth, PostgreSQL is a rebuildable index, and Arweave is permanent off-chain storage. The Python similarity oracle runs as a separate process because ML libraries (imagehash, chromaprint) only exist in Python. All inter-service communication is HTTP; no service accesses another database directly.

**Major components:**
1. **MCP Server** -- agent-facing API, tool dispatch, multi-step flow orchestration (stateless)
2. **Indexer Service** -- Helius webhook receiver, PostgreSQL writer, search/browse/provenance query API
3. **Storage Service** -- Irys/Arweave upload wrapper, receipt validation, permanent URI generation
4. **Evidence Engine** -- PDF generation per jurisdiction, Arweave anchoring, Meridian PDA creation (async via job queue)
5. **Similarity Oracle** -- Python FastAPI sidecar for pHash/Chromaprint computation and hamming distance comparison
6. **Key Vault** -- BIP-44 HD derivation from master seed, encrypted storage, transaction signing proxy
7. **4 Solana Programs** -- Spore (registration), Hypha (licensing), Rhizome (royalties), Meridian (evidence)

### Critical Pitfalls

1. **Unconstrained account authorities** -- UpdateStatus has no signer check; anyone can revoke any IP. distribute_royalties accepts unconstrained pool/wallet addresses. Fix with has_one and constraint checks on every instruction. Phase M1, non-negotiable.
2. **Unverified Ed25519 signatures in evidence** -- Meridian accepts any 64 bytes as a protocol signature. Test suite uses all-ones fake signature. A lawyer can trivially demonstrate the protocol accepts fake signatures, destroying every MEP evidentiary value. Fix with Ed25519 precompile verification. Phase M1.
3. **Account schema misalignment** -- original_creator exists in Rust source but not in deployed program. TypeScript deserializers read wrong byte offsets for every field. Silent data corruption across entire protocol. Fix with realloc migration instruction + version byte. Phase M1.
4. **UncheckedAccount for cross-program references** -- Hypha CreateLicenseTemplate accepts any address as an IPAsset. Licenses can reference non-existent IPs. Fix with typed Account or owner constraint. Phase M1.
5. **Single-key program authority** -- On mainnet, a single compromised laptop means total protocol takeover. Courts will argue the operator can alter evidence records. Fix with Squads multisig (2-of-3 minimum). Phase M3.

## Implications for Roadmap

Based on combined research, the build order is dictated by security dependencies (nothing else matters if the on-chain programs are exploitable), then data flow dependencies (indexer and storage unblock everything downstream), then the evidence engine (longest dependency chain, highest-value feature).

### Phase 1: Security Hardening + Schema Alignment (M1)
**Rationale:** Every other phase builds on the assumption that on-chain programs are secure and data is correctly deserialized. Without this, building features on top is building on sand.
**Delivers:** Secure, correctly-deserialized on-chain programs with IDL-generated TypeScript client.
**Addresses:** original_creator fix, UpdateStatus authority constraint, Rhizome distribution pool constraint, UncheckedAccount replacement in Hypha, Ed25519 signature verification in Meridian, Anchor IDL client generation (replaces 3 manual Borsh deserializers).
**Avoids:** Pitfalls 1-4, 6, 13 (unconstrained authorities, fake signatures, schema misalignment, fake cross-program references, manual Borsh divergence, Option padding bugs).

### Phase 2: Off-Chain Infrastructure (M2)
**Rationale:** On-chain programs are now secure but inaccessible without indexing, storage, and key management. This phase builds the service layer that makes the programs usable.
**Delivers:** Working search/browse, permanent metadata storage, per-agent wallets, USDC payment integration.
**Uses:** Helius webhooks + DAS API, Irys/Arweave, BIP-44 HD derivation, @solana/spl-token.
**Implements:** Indexer Service, Storage Service, Key Vault (architecture components 2, 3, 6).
**Avoids:** Pitfalls 7, 10 (unbounded getProgramAccounts, shared keypair).

### Phase 3: Licensing + Royalties Live (M2.5)
**Rationale:** Depends on USDC integration (Phase 2) and secure Hypha/Rhizome programs (Phase 1). This is the commercial engine -- no revenue without working licensing.
**Delivers:** End-to-end license template creation, acquisition, verification, royalty configuration and distribution with USDC.
**Addresses:** Hypha live adapter (currently throws on all license operations), Rhizome USDC support (currently SOL-only), license verification via CPI.
**Avoids:** Pitfall 9 (cost estimation blindness -- validate mainnet rent costs for license/royalty PDAs).

### Phase 4: Evidence Engine + Jurisdiction Templates (M2-M3)
**Rationale:** Longest dependency chain -- requires indexer (IP history), storage (Arweave anchoring), keys (protocol authority), and fixed Ed25519 verification. This is the killer feature and most complex deliverable.
**Delivers:** Court-ready PDF evidence packages with PoH timestamp verification, content hash proof, provenance chain, Arweave-anchored evidence, Indonesia + WIPO jurisdiction formatting.
**Addresses:** Evidence package generation (currently placeholder), jurisdiction-specific formatting (differentiator vs Story Protocol), Meridian PDA creation.
**Avoids:** Pitfalls A, B, C (timestamp is not proof of creation, jurisdiction formatting is not optional, upgradeable programs undermine legal trust).

### Phase 5: Similarity Oracle + Dispute Resolution (M2-M3)
**Rationale:** Depends on indexer (hash index population) and PostgreSQL (Phase 2). Can partially parallelize with Phase 4. Completes the IP protection loop.
**Delivers:** Real perceptual hash similarity detection (pHash for images, Chromaprint for audio), dispute filing with whitelisted arbiters, evidence submission for disputes.
**Implements:** Similarity Oracle (architecture component 5), DRP program hardening.
**Avoids:** Pitfall 14 (fake perceptual hash that is actually SHA-256 with salt).

### Phase 6: Mainnet Deployment (M3)
**Rationale:** All features working on devnet. This phase is about production readiness: multisig governance, cost validation, RPC reliability, deployment runbook.
**Delivers:** Mainnet-deployed protocol with Squads multisig, Helius production RPC, verified program builds, deployment checklist.
**Avoids:** Pitfalls 5, 8, 11, 12 (single-key authority, RPC reliability, hardcoded program IDs, Anchor version mismatch).

### Phase Ordering Rationale

- **Security before features:** Pitfalls 1-4 are exploitable on devnet today. Building licensing on top of unconstrained programs is wasted work.
- **Infrastructure before application:** The evidence engine (Phase 4) depends on indexer, storage, and keys (Phase 2). Attempting evidence generation without these services produces the current state: placeholder paths and fake data.
- **Licensing before evidence:** Revenue (Phase 3) funds development. Evidence (Phase 4) is more complex and takes longer. Shipping licensing first validates commercial demand.
- **Similarity and disputes can parallelize with evidence:** The Python oracle is independent and can be built by a different developer/agent alongside the evidence engine.
- **Mainnet last:** Every pre-mainnet phase reduces the blast radius of deployment mistakes.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Evidence Engine):** Court admissibility standards per jurisdiction are under-researched. Indonesian DJKI requirements, EU eIDAS qualified electronic ledger standards (Regulation 2025/2531), and WIPO PCT evidence formatting all need legal counsel review before building templates. The $0.004 cost claim also needs validation against actual mainnet rent-exempt minimums.
- **Phase 5 (Similarity Oracle):** pHash algorithm selection (dHash vs pHash vs aHash), threshold tuning (hamming distance cutoffs), and false positive rates need empirical testing with real INFIA content. No standard exists for blockchain-based perceptual hash registries.

Phases with standard patterns (skip deep research):
- **Phase 1 (Security Hardening):** Anchor constraint patterns are well-documented. Helius security guide covers all vulnerability classes. Standard practice.
- **Phase 2 (Infrastructure):** Helius webhook integration, Irys uploads, and BIP-44 derivation all have production examples and official documentation.
- **Phase 6 (Mainnet Deployment):** Squads multisig + verifiable builds + deployment checklists are standard Solana practice.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Brownfield -- technologies are already deployed and working. Version pinning decisions well-supported by Anchor changelog and compatibility matrix. |
| Features | MEDIUM-HIGH | Story Protocol competitive analysis verified against official docs. Court admissibility standards verified via peer-reviewed Frontiers article (2026) and TRM Labs. Agent API patterns emerging but not yet standardized. |
| Architecture | HIGH | Service-oriented architecture with webhook-driven indexing is the established pattern for production Solana protocols. Helius docs, Irys SDK, and BIP-44 derivation all have extensive documentation. |
| Pitfalls | HIGH | All 5 critical pitfalls verified against actual codebase (CONCERNS.md audit). Wormhole exploit pattern is well-documented. Ed25519 verification gap confirmed by test suite analysis. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Mainnet cost model:** The $0.004 per registration claim is transaction fee only. Actual cost includes rent-exempt minimum (~$0.40-0.60 at $195/SOL). Need to decide who pays rent (protocol treasury vs creator pass-through) and update marketing accordingly.
- **Indonesian court admissibility:** No primary source confirming Indonesian courts have accepted blockchain evidence under UU ITE. DJKI requirements for electronic evidence formatting are not documented in English-language sources. Need Indonesian IP lawyer consultation.
- **Irys SDK stability:** @irys/upload-solana is at 0.1.x (pre-1.0). API may change. Wrap in thin adapter layer to isolate blast radius.
- **Evidence engine legal review:** The distinction between proof of existence and proof of creation must be clearly communicated in evidence packages. A legal professional must review the evidence template before it is presented to any court.
- **USDC integration complexity:** SPL token transfers require associated token account creation, decimal handling (6 decimals for USDC), and createTransferCheckedInstruction. More complex than SOL transfers. Needs dedicated testing with devnet USDC mint.

## Sources

### Primary (HIGH confidence)
- [Anchor Releases (GitHub)](https://github.com/solana-foundation/anchor/releases) -- version compatibility, breaking changes
- [Helius Webhooks Documentation](https://www.helius.dev/docs/webhooks) -- real-time monitoring, webhook format
- [Helius Security Guide](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security) -- vulnerability catalog
- [Story Protocol PIL Documentation](https://docs.story.foundation/concepts/programmable-ip-license/overview) -- competitor feature analysis
- [Story Protocol Whitepaper](https://www.story.foundation/whitepaper.pdf) -- IP graph architecture
- [Squads Protocol](https://squads.xyz/blog/solana-multisig-program-upgrades-management) -- multisig governance
- [Solana Cookbook](https://solanacookbook.com/guides/data-migration.html) -- account migration patterns
- [Frontiers: Blockchain Evidentiary Value (2026)](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1783805/full) -- court admissibility standards

### Secondary (MEDIUM confidence)
- [Irys SDK (npm/GitHub)](https://github.com/Irys-xyz/js-sdk) -- upload API, modular architecture
- [TRM Labs: Blockchain Evidence](https://www.trmlabs.com/resources/blog/building-strong-cases-with-blockchain-evidence-admissibility-chain-of-custody-experts-and-court-ready-reporting) -- chain of custody
- [Perceptual Hash Registry on Blockchain (arxiv 2025)](https://arxiv.org/abs/2602.02412) -- decentralized similarity detection
- [Postman 2025 State of API Report](https://blog.apilayer.com/ai-agents-are-the-new-users-of-your-api-how-to-make-your-api-agent-ready/) -- agent API design patterns

### Tertiary (LOW confidence)
- [Blockchain IP Protection Market Report 2025](https://www.globenewswire.com/news-release/2026/04/09/3270739/0/en/) -- market sizing, needs validation

---
*Research completed: 2026-04-12*
*Ready for roadmap: yes*
