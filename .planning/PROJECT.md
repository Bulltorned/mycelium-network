# Mycelium Protocol

## What This Is

Decentralized IP infrastructure on Solana — instant registration ($0.004, 400ms), programmable licensing, automated royalty distribution, and court-ready evidence packages. Four Anchor programs (Spore, Hypha, Rhizome, Meridian) exposed to AI agents via MCP server and to humans via Next.js frontend. Built as infrastructure for INFIA Group's 36+ IP portfolio and the broader Global South creator economy.

## Core Value

**Any creator, anywhere, can prove they made something first — for $0.004, in 400ms, with evidence that holds up in court.**

Registration + PoH timestamping is the foundation. Everything else (licensing, royalties, evidence) builds on this.

## Requirements

### Validated

- ✓ Spore program deployed to devnet — IP registration, derivatives, metadata update, ownership transfer, status change — existing
- ✓ Hypha program deployed to devnet — license template creation, acquisition, verification — existing
- ✓ Rhizome program deployed to devnet — royalty config, deposit, distribution — existing
- ✓ Meridian program deployed to devnet — MEP PDA creation, Arweave URI storage — existing
- ✓ MCP server (mock mode) — all 13 tools functional against MockSolanaAdapter — existing
- ✓ MCP server (live mode, partial) — register_ip, search_ip, get_ip, verify_provenance, check_similarity, get_wallet work on devnet — existing
- ✓ Next.js frontend — registration page, asset browser, asset detail, wallet connection — existing
- ✓ SolanaAdapter interface with mock/live swap via SOLANA_LIVE=1 — existing
- ✓ 11 IP types supported — existing
- ✓ Agent protocol manifests (A2A, UCP) declared — existing

### Active

- [ ] Fix schema drift: redeploy Spore with `original_creator` field, align all deserializers
- [ ] Generate Anchor IDL client, replace 3 manual Borsh deserializers
- [ ] Fix discriminator mismatch between MCP server and frontend
- [ ] Fix UpdateStatus authority constraint (protocol authority or DRP only)
- [ ] Fix GenerateMEP Ed25519 signature verification on-chain
- [ ] Fix Hypha ip_asset UncheckedAccount → verified IPAsset PDA
- [ ] Fix Rhizome distribution_pool/platform_wallet constraints
- [ ] Add Rhizome test suite
- [ ] Implement Hypha live adapter (license creation, acquisition, verification)
- [ ] Implement DRP program (dispute filing, resolution)
- [ ] Integrate Arweave/Irys for metadata upload
- [ ] Integrate Helius indexer for scalable search and provenance
- [ ] Per-agent wallet derivation (BIP-44, not shared keypair)
- [ ] Similarity Oracle MVP (pHash images, Chromaprint audio)
- [ ] Evidence Engine MVP (PDF generation, jurisdiction formatting, Arweave anchoring)
- [ ] USDC payment integration (SPL token transfers in Hypha/Rhizome)
- [ ] Mainnet deployment configuration and program verification
- [ ] Delete stale root mycelium_spore_lib.rs

### Out of Scope

- Token launch ($MYCO or similar) — protocol is pure infrastructure, no speculation
- Mobile app — web + MCP covers all use cases for now
- Full WIPO integration API — evidence packages are formatted for manual submission
- Layer 3 semantic embeddings (CLIP/CLAP) — defer to post-mainnet
- @solana/web3.js v1→v2 migration — v1 receives security patches, defer to post-M4

## Context

- **Brownfield:** 4 Anchor programs deployed on devnet, MCP server and frontend working, but critical bugs in schema alignment and security constraints
- **Owner:** Mycelium SG (Singapore entity under Aji Pratomo personal holdings, outside INFIA corporate structure)
- **First customer:** INFIA Group — 36+ IPs, 120M+ audience, INMF coalition of 38+ creators
- **Deployer wallet:** `F98xBPaujC3CXiKWRqudUYksw3vKoGhMAohmDoHdU9ye`
- **Stack:** Anchor 0.30.1 (Rust), TypeScript 5.7, Node.js 20+, Next.js 14, @solana/web3.js 1.98
- **Critical finding:** Root `mycelium_spore_lib.rs` has `original_creator` but deployed program does not — live adapter deserializer is 32 bytes misaligned
- **Security:** 6 critical/high constraint bugs identified in codebase audit (see CONCERNS.md)

## Constraints

- **Platform:** Solana blockchain (devnet now, mainnet-beta target)
- **Framework:** Anchor 0.30.1 for all on-chain programs
- **No token:** Protocol must remain infrastructure-only, no token economics
- **Content off-chain:** Only hashes and Arweave URIs go on-chain, never raw content
- **Jurisdictions:** Evidence packages must format correctly for Indonesia, Kenya, Colombia, WIPO
- **Dev environment:** Windows 11, no Anchor CLI installed locally (need WSL or remote build)
- **Budget:** Devnet SOL for testing, Arweave/Irys credits for metadata storage

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Split `original_creator` (immutable) from `creator` (mutable) | PDA seeds must remain stable after ownership transfer | — Pending (needs redeploy) |
| Protocol authority for UpdateStatus | Any-signer bug allows arbitrary status changes | — Pending (fix in M1) |
| Manual Borsh → Anchor IDL client | 3 duplicate deserializers, discriminator mismatch, silent data corruption | — Pending (fix in M1) |
| Mycelium SG as protocol entity (outside INFIA) | Protocol infrastructure should be independent of any single media company | ✓ Good |
| No token | Keeps focus on infrastructure value, avoids regulatory complexity | ✓ Good |
| MCP as primary agent interface | Anthropic's standard, works with Claude/GPT/Gemini, future-proof | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-12 after initialization*
