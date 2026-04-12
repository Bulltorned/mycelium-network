# Domain Pitfalls

**Domain:** Solana/Anchor IP infrastructure protocol (devnet-to-mainnet hardening)
**Researched:** 2026-04-12
**Confidence:** HIGH (verified against Helius security guide, Solana Cookbook, Anchor changelog, known exploit post-mortems)

---

## Critical Pitfalls

Mistakes that cause exploits, data loss, or protocol-level rewrites.

### Pitfall 1: Unconstrained Account Authorities (the Wormhole pattern)

**What goes wrong:** Instructions accept a `Signer` account but never bind it to the expected authority stored in the PDA. Any wallet that signs the transaction can execute privileged operations. This is the #1 cause of Solana exploits -- the Wormhole exploit ($325M) was exactly this pattern.

**Why it happens:** Anchor's `Signer<'info>` type verifies someone signed, but not WHO signed. Developers assume "signer = authorized" and skip the `constraint` or `has_one` check.

**Consequences:** In Mycelium specifically: `UpdateStatus` has no authority constraint -- anyone can mark an IP as `Disputed`, `Suspended`, or `Revoked`. On mainnet, a single malicious tx could revoke every registered IP. The `distribute_royalties` instruction accepts unconstrained `distribution_pool` and `platform_wallet` -- a caller can drain the royalty vault to any address.

**Prevention:**
- Every instruction with a `Signer` MUST have `#[account(constraint = authority.key() == some_pda.authority_field)]`
- Use `has_one = authority` on PDA accounts where the authority pubkey is stored
- Store `platform_wallet` in `RoyaltyConfig` PDA at creation, verify at distribution
- Audit every instruction: "What happens if a stranger calls this?" If the answer isn't "nothing", it's a bug

**Detection:** Grep for `Signer<'info>` without an adjacent `constraint` or `has_one`. Grep for `SystemAccount<'info>` or `UncheckedAccount<'info>` in distribution/payment contexts.

**Phase:** M1 (Security Hardening) -- fix before any mainnet deployment. Non-negotiable.

---

### Pitfall 2: UncheckedAccount Allowing Fake Cross-Program References

**What goes wrong:** An instruction accepts `UncheckedAccount<'info>` for a cross-program account (e.g., an IPAsset PDA from the Spore program) instead of verifying the account is actually owned by that program and contains valid data. Anyone can pass any address.

**Why it happens:** Cross-program account verification requires either importing the other program's account types via CPI or manually checking `account.owner == expected_program_id`. Both are more work than `UncheckedAccount`.

**Consequences:** In Mycelium: Hypha's `CreateLicenseTemplate` accepts `ip_asset: UncheckedAccount<'info>`. A licensor can create a license template pointing at a random address -- the license appears to cover an IP asset that doesn't exist. On mainnet, this makes every license potentially fraudulent. Courts receiving evidence packages with fake IP references would invalidate the entire protocol's credibility.

**Prevention:**
- Replace `UncheckedAccount` with `Account<'info, IPAsset>` where the type is imported via CPI
- At minimum: `#[account(owner = spore_program::ID)]` to verify the account belongs to the Spore program
- Add a constraint verifying the IPAsset status is `Active` (not revoked/suspended)
- Never accept cross-program accounts without ownership verification

**Detection:** Grep for `UncheckedAccount` in all instruction contexts. Each one is a potential exploit unless there's explicit owner/data validation in the instruction body.

**Phase:** M1 (Security Hardening)

---

### Pitfall 3: Unverified Ed25519 Signatures in Evidence Packages (MEP)

**What goes wrong:** The protocol stores a `[u8; 64]` "protocol signature" on-chain without actually verifying it against the protocol authority's public key. The test suite uses `new Array(64).fill(1)` (all-ones fake signature) and it passes. Any caller can anchor a fraudulent MEP.

**Why it happens:** Ed25519 signature verification on Solana requires using the Ed25519 precompile program (`Ed25519SigVerify111111...`) as a preceding instruction in the same transaction, then checking the instruction sysvar. This is non-trivial and most tutorials skip it.

**Consequences:** MEPs are presented to courts as "cryptographically verified" evidence. If the signature isn't actually verified on-chain, a lawyer can demonstrate the on-chain program accepts any 64 bytes -- destroying the evidentiary value of every MEP in the protocol. This is an existential threat to the core value proposition ("evidence that holds up in court").

**Prevention:**
- Use `anchor_lang::solana_program::ed25519_program` to verify signatures on-chain
- Alternative: store the protocol authority pubkey in a `ProtocolConfig` PDA, require an Ed25519 verify instruction in the same transaction
- Test with WRONG signatures and verify they FAIL -- the test suite must prove rejection, not just acceptance
- Have a legal expert review the on-chain verification flow before claiming "court-ready"

**Detection:** Check if Ed25519 verification exists anywhere in the Meridian program. If the only signature handling is storing raw bytes, it's unverified.

**Phase:** M1 (Security Hardening) -- this must be fixed before any MEP is presented as evidence

---

### Pitfall 4: Account Migration After Adding/Removing Fields (the `original_creator` problem)

**What goes wrong:** After upgrading a deployed program to add fields (like `original_creator`), existing accounts still have the old layout. Deserializers expecting the new layout read misaligned data -- every field after the change point returns garbage. Evidence packages built from this data are cryptographically wrong.

**Why it happens:** Solana accounts are raw byte buffers. Unlike databases, there's no ALTER TABLE. When you add a 32-byte field at position X, every field after X shifts by 32 bytes. Existing accounts aren't automatically migrated.

**Consequences:** In Mycelium specifically: the root `mycelium_spore_lib.rs` has `original_creator` but the deployed program doesn't. The TypeScript deserializer reads `original_creator` as the first 32 bytes before `creator` -- meaning `getIPAsset` returns wrong data for EVERY field. Content hashes read as creators, creators as hashes. Silent data corruption across the entire protocol.

**Prevention:**
- Use Anchor's new `Migration<'info, From, To>` account type (added in recent versions) for schema transitions
- Include a `data_version: u8` field in every account struct from day one
- Pre-allocate extra space in accounts (Solana Cookbook recommends significant padding)
- Write a dedicated migration instruction that reads old layout, writes new layout, updates version
- Test migration with real devnet accounts before mainnet upgrade
- NEVER change field order in a struct -- only append new fields at the end

**Detection:** Compare the Rust struct definition against every TypeScript deserializer. If byte offsets don't match, data is silently corrupted. Anchor IDL client eliminates this entire class of bugs.

**Phase:** M1 (Schema Alignment) -- must resolve before any new devnet registrations

---

### Pitfall 5: Single-Key Program Authority on Mainnet

**What goes wrong:** The program's upgrade authority is a single keypair (often the developer's local wallet). If that key is compromised, an attacker can upload a malicious program that drains all PDAs. If the key is lost, the program can never be upgraded again.

**Why it happens:** `anchor deploy` defaults to the local keypair as upgrade authority. Devnet deploys never change this because it's convenient. Teams forget to change it before mainnet.

**Consequences:** For an IP protocol claiming court-admissibility, a single-key authority undermines the entire trust model. A court could argue the protocol operator can unilaterally modify the program to alter evidence records. For security, one compromised laptop means total protocol takeover.

**Prevention:**
- Use Squads multisig as the program upgrade authority on mainnet
- Minimum 2-of-3 multisig with hardware wallets from different manufacturers
- Transfer authority BEFORE mainnet deploy, not after
- Consider making programs immutable after sufficient hardening (no upgrade authority at all)
- Document the authority governance model for legal/court purposes
- Use `solana program show --programs` to verify authority settings post-deploy

**Detection:** Run `solana program show <program_id>` on mainnet -- if "Upgrade Authority" is a single pubkey (not a multisig), it's a risk.

**Phase:** M3 (Mainnet Deployment) -- configure before first mainnet deploy

---

## Moderate Pitfalls

### Pitfall 6: Manual Borsh Deserializers Diverging from On-Chain Layout

**What goes wrong:** Multiple manual binary deserializers (Mycelium has THREE) hardcode byte offsets. Any on-chain struct change silently breaks all of them with no compile-time error. Discriminators are hardcoded in two places with different values.

**Prevention:**
- Generate Anchor IDL JSON via `anchor build` and use `@coral-xyz/anchor` client everywhere
- Delete ALL manual deserializers -- one IDL client replaces all three
- If manual parsing is temporarily necessary, create ONE shared utility, not three copies
- Add integration tests that deserialize real devnet accounts and validate field values

**Phase:** M1 (Schema Alignment)

---

### Pitfall 7: `getProgramAccounts` Unbounded Scan on Mainnet

**What goes wrong:** `searchIP` and `getProvenance` call `getProgramAccounts` with no size filter, downloading the entire registry into client memory. On mainnet with >10,000 assets, this hits RPC rate limits, times out, or costs significant RPC credits. The 30-second polling interval in the React hook makes this worse.

**Prevention:**
- Integrate Helius DAS API for indexed queries -- this is the standard for production Solana apps
- Add `dataSize` filter to `getProgramAccounts` to at least exclude non-IPAsset accounts
- Implement server-side pagination with `dataSlice` for large account sets
- Replace 30-second polling with WebSocket subscriptions for account changes
- Set up a Postgres index via Helius webhooks for complex queries

**Phase:** M2 (Infrastructure) -- must be solved before mainnet launch with real data

---

### Pitfall 8: RPC Provider Reliability Under Load

**What goes wrong:** Public/shared RPC endpoints work fine on devnet but degrade on mainnet during traffic spikes. Latency balloons from <100ms to seconds. Rate limits kick in. Transaction confirmations are missed. The protocol appears broken to users even though the on-chain programs are fine.

**Prevention:**
- Use a dedicated RPC provider (Helius, QuickNode, or Chainstack) -- never rely on public mainnet RPCs
- Implement RPC fallback with multiple providers (primary + secondary)
- Use websocket connections for confirmation instead of polling
- Set realistic timeouts and retry logic with exponential backoff
- Budget $100-400/month minimum for a production RPC plan
- Test under load: simulate 100+ concurrent registrations before launch

**Detection:** Monitor RPC response times and error rates. If p95 latency exceeds 2 seconds or error rate exceeds 1%, the provider is insufficient.

**Phase:** M3 (Mainnet Deployment)

---

### Pitfall 9: Cost Estimation Blindness (Rent, Transaction Fees, Storage)

**What goes wrong:** Teams estimate costs based on devnet (where SOL is free) and are shocked by mainnet economics. Each IPAsset PDA requires rent-exempt deposit (~0.002-0.003 SOL per account depending on size). At $195/SOL (Nov 2025), that's $0.40-0.60 per registration, not $0.004. Transaction fees are additional. Arweave storage has separate costs.

**Prevention:**
- Calculate exact rent-exempt minimum for each account type: `solana rent <bytes>`
- Model costs at multiple SOL price points ($50, $150, $300)
- Pre-fund a fee payer wallet and monitor balance with alerts
- Consider who pays rent: protocol (treasury), creator (pass-through), or subsidized
- Budget separately for: account rent, transaction fees, priority fees (during congestion), Arweave uploads, RPC provider, Helius indexer
- The "$0.004 registration" claim needs to be validated against actual mainnet rent costs

**Detection:** If cost projections don't include rent-exempt minimums, they're wrong.

**Phase:** M2-M3 (Infrastructure and Deployment)

---

### Pitfall 10: Per-Agent Wallet Security (Shared Keypair Anti-Pattern)

**What goes wrong:** All MCP agents share a single keypair loaded from disk. If one agent is compromised, all on-chain actions appear to come from the same identity. On server restart, in-memory wallet associations are lost. The single keypair on disk is a catastrophic single point of failure.

**Prevention:**
- Implement BIP-44 hierarchical deterministic key derivation: one master seed, unique keypair per agent via derivation path
- Use a wallet-as-a-service provider (Turnkey, Crossmint) for production key management
- Store master seed in a hardware security module (HSM) or secrets manager, never on disk
- Each agent should have its own on-chain identity for audit trail purposes
- Implement key rotation without disrupting agent operations

**Phase:** M2 (Infrastructure)

---

## Minor Pitfalls

### Pitfall 11: Devnet Program IDs Hardcoded Everywhere

**What goes wrong:** Program IDs, RPC URLs, and cluster references are scattered across `Anchor.toml`, TypeScript constants, environment variables, and frontend config. Missing one during mainnet migration means the frontend talks to devnet while the backend talks to mainnet.

**Prevention:**
- Single source of truth: one config file or env var set that ALL components read
- Add `[programs.mainnet-beta]` to `Anchor.toml` now, even if empty
- Create a deployment checklist that verifies every program ID reference
- Use `solana program show` post-deploy to verify correct program on correct cluster

**Phase:** M3 (Mainnet Deployment)

---

### Pitfall 12: Anchor Version Mismatch Between Build and Runtime

**What goes wrong:** Building with Anchor 0.30.1 but deploying where the Anchor discriminator format or account layout assumptions differ. Or upgrading Anchor version mid-project without rebuilding all programs, causing discriminator mismatches.

**Prevention:**
- Pin Anchor version in `Anchor.toml` and `Cargo.lock`
- Use Anchor's verifiable builds (`anchor build --verifiable`) for mainnet
- Never upgrade Anchor version without rebuilding AND redeploying all programs
- Document the exact Anchor version used for each deployment

**Phase:** M3 (Mainnet Deployment)

---

### Pitfall 13: `Option<Pubkey>` and Enum Padding Deserialization Bugs

**What goes wrong:** Manual deserializers assume specific byte widths for `Option` types and enum variants. Anchor's serialization of `Option<Pubkey>` is always 33 bytes (1 tag + 32 data) regardless of `Some`/`None`, but this assumption breaks for other `Option` types. Enum padding (1 byte vs 2 bytes) varies by alignment context.

**Prevention:**
- Use Anchor IDL client (eliminates manual byte math entirely)
- If manual parsing is required, test with every possible enum value and both `Some`/`None` variants
- Never assume padding -- verify against actual on-chain binary data

**Phase:** M1 (Schema Alignment)

---

### Pitfall 14: "Perceptual Hash" That Isn't Perceptual

**What goes wrong:** The similarity oracle uses SHA-256 with a salt prefix, labeled as "perceptual hash." A 1-pixel change produces a completely different hash. The entire similarity detection system (near-duplicate, derivative matching) is therefore non-functional. Only exact byte-for-byte copies are caught.

**Prevention:**
- Implement actual perceptual hashing: pHash/dHash for images, Chromaprint for audio
- This requires an off-chain service (Python with imagehash/chromaprint libraries)
- Store perceptual hash separately from content hash (they serve different purposes)
- Content hash = integrity proof (SHA-256). Perceptual hash = similarity detection (pHash)

**Phase:** M2 (post-security, pre-mainnet) -- deferred similarity oracle is acceptable for MVP but must be real before claiming "similarity detection"

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| M1: Security Hardening | Fixing constraints breaks existing devnet accounts | Test constraint changes against existing devnet PDAs before redeploying. Some may need migration. |
| M1: Schema Alignment | Adding `original_creator` shifts all bytes | Use `realloc` + `Migration` type. Pre-allocate space in new struct. Write migration instruction. |
| M1: IDL Client | Generated client reveals new bugs hidden by manual parsing | This is GOOD -- better to find bugs now. Budget time for fixing what IDL client exposes. |
| M2: Helius Integration | Over-reliance on a single indexer provider | Implement fallback to raw `getProgramAccounts` for critical paths. Cache aggressively. |
| M2: USDC Integration | SPL token transfers are more complex than SOL transfers | Use `anchor_spl::token` crate. Test with devnet USDC mint. Handle token account creation (associated token accounts). |
| M3: Mainnet Deploy | First deploy with wrong authority or program ID | Use a deployment runbook. Verify every step. Deploy to mainnet-beta staging first if possible. |
| M3: Evidence Engine | Court rejects evidence because on-chain verification is inadequate | Have legal counsel review the verification chain BEFORE building. Indonesian, Kenyan, Colombian courts have different standards. |
| Post-launch: Program Upgrade | Upgrade breaks existing accounts or changes PDA derivation | NEVER change PDA seeds on an upgrade. Test upgrade path on a forked mainnet (solana-test-validator with mainnet clone). |

---

## Court-Admissibility Specific Pitfalls

### Pitfall A: Blockchain Timestamps Are Not Proof of Creation

**What goes wrong:** The protocol proves WHEN something was registered on-chain, not WHEN it was created. A court may ask: "You registered this on March 15, but did you create it on March 15 or did someone else create it on March 1?" On-chain registration is proof of existence at a point in time, not proof of original authorship.

**Prevention:**
- Frame evidence as "proof of prior existence" (PoE), not "proof of creation"
- Combine on-chain timestamp with off-chain corroborating evidence (drafts, commit history, metadata EXIF)
- Evidence packages must clearly state what the blockchain proves and what it doesn't
- Follow the three conditions courts require: authenticity (linked to verified source), integrity (hash confirms no modification), and documented chain of custody

**Phase:** M2 (Evidence Engine design)

---

### Pitfall B: Jurisdiction-Specific Formatting Is Not Optional

**What goes wrong:** Indonesia, Kenya, Colombia, and WIPO each have different evidentiary standards, different document formats, and different attitudes toward blockchain evidence. A one-size-fits-all evidence package will be rejected in at least some jurisdictions.

**Prevention:**
- Research specific requirements per jurisdiction BEFORE building formatters
- EU has established standards (Regulation 2025/2531 for qualified electronic ledgers)
- Indonesia: consult with local IP lawyers on DJKI requirements
- WIPO: evidence packages for PCT filings have specific prior art formats
- Build jurisdiction as a first-class parameter, not an afterthought

**Phase:** M2-M3 (Evidence Engine)

---

### Pitfall C: Upgradeable Programs Undermine Legal Trust

**What goes wrong:** A lawyer argues: "The protocol operator can upgrade the program at any time, meaning they could have altered the evidence records after the fact. How can this evidence be trusted?" If the program authority is a single keypair, this argument is devastating.

**Prevention:**
- Use multisig governance with transparent, auditable upgrade process
- Log every program upgrade on-chain with version hashes
- Consider making evidence-related programs (Spore, Meridian) immutable after sufficient hardening
- Provide verifiable builds so anyone can confirm the deployed code matches the source
- Document governance model in evidence packages

**Phase:** M3 (Mainnet Deployment) and ongoing

---

## Sources

- [Helius: A Hitchhiker's Guide to Solana Program Security](https://www.helius.dev/blog/a-hitchhikers-guide-to-solana-program-security) -- HIGH confidence, comprehensive vulnerability catalog
- [Solana Cookbook: Program Data Migration](https://solanacookbook.com/guides/data-migration.html) -- HIGH confidence, official community resource
- [Anchor PR #4060: Migration Account Type](https://github.com/solana-foundation/anchor/pull/4060) -- HIGH confidence, first-party Anchor feature
- [Squads: Managing Program Upgrades with Multisig](https://squads.xyz/blog/solana-multisig-program-upgrades-management) -- HIGH confidence, standard practice
- [Cantina: Securing Solana Developer Guide](https://cantina.xyz/blog/securing-solana-a-developers-guide) -- MEDIUM confidence
- [Solana Security Checklist (DEV.to)](https://dev.to/ohmygod/solana-program-security-checklist-14-critical-checks-before-you-deploy-to-mainnet-2d66) -- MEDIUM confidence
- [Frontiers: Blockchain Evidentiary Value in Civil Litigation (2026)](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1783805/full) -- HIGH confidence, peer-reviewed
- [TRM Labs: Building Strong Cases with Blockchain Evidence](https://www.trmlabs.com/resources/blog/building-strong-cases-with-blockchain-evidence-admissibility-chain-of-custody-experts-and-court-ready-reporting) -- MEDIUM confidence
- [Chainstack: Best Solana RPC Providers 2026](https://chainstack.com/best-solana-rpc-providers-in-2026/) -- MEDIUM confidence
- [Solana: Production Readiness Guide](https://solana.com/docs/payments/production-readiness) -- HIGH confidence, official docs
- Mycelium CONCERNS.md codebase audit (2026-04-07) -- HIGH confidence, direct codebase analysis

---

*Pitfalls audit: 2026-04-12*
