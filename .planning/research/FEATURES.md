# Feature Research

**Domain:** On-chain IP infrastructure protocol (registration, licensing, royalties, evidence, disputes)
**Researched:** 2026-04-12
**Confidence:** MEDIUM-HIGH (Story Protocol docs verified, legal evidence standards cross-referenced, AI agent API patterns emerging but not standardized)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = protocol feels incomplete or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| IP Registration with content hash + timestamp | Core primitive. Without it, nothing else works. Every competitor has this. | LOW | Mycelium has this (Spore program). Must fix `original_creator` field drift. |
| Ownership transfer with provenance chain | IP changes hands. Must track original creator immutably. Story Protocol tracks full parent-child IP graphs. | MEDIUM | Spore has `transfer_ownership` but loses `original_creator` on-chain. Critical gap. |
| License template creation with configurable terms | Story Protocol's PIL sets the bar: commercial use, derivatives allowed, attribution required, territory, revenue share %. Any IP protocol without programmable licenses is just a timestamp service. | MEDIUM | Hypha has this in design but live adapter throws on all license operations. |
| License acquisition and verification | Licensees must be able to acquire, prove, and have their license verified on-chain. This is the commercial engine. | MEDIUM | Hypha stub only. Must implement CPI calls. |
| Royalty configuration and automated distribution | Revenue must flow automatically to creators and ancestors in the IP graph. Story has this as a core module. IPwe has it for patents. | HIGH | Rhizome exists but only handles SOL, not USDC/SPL tokens. Distribution pool address is unconstrained (security bug). |
| Content hash verification (exact match) | Proof that a specific file was registered. SHA-256 of content stored on-chain. Every blockchain IP system does this. | LOW | Already implemented. Working correctly. |
| Metadata storage (off-chain with on-chain pointer) | Full metadata (title, description, media) is too large for on-chain. Arweave/IPFS URI stored on-chain is standard. | MEDIUM | Meridian MEP stores Arweave URI but upload not implemented. Placeholder paths only. |
| Wallet-based identity and signing | Users authenticate via wallet. All actions are signed transactions. | LOW | Working via Phantom/Solflare integration. |
| Basic search and browsing | Users need to find IPs, browse the registry, filter by type/creator. | MEDIUM | Working but uses unbounded `getProgramAccounts` scan. Will break at scale. Needs Helius indexer. |
| Derivative/remix registration with parent link | Creative works build on each other. Must track parent-child relationships. Story Protocol's entire value prop is the "IP Graph" of remixes. | MEDIUM | Spore has `register_derivative` but `registerIP` ignores `parentIp` param (known bug). |

### Differentiators (Competitive Advantage)

Features that set Mycelium apart from Story Protocol and general-purpose IP registries.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Court-ready evidence packages** | Story Protocol has NO evidence generation. It is purely an on-chain licensing engine. Mycelium's core value prop is "$0.004 registration with evidence that holds up in court." This is the killer feature for Global South creators who need legal proof, not DeFi composability. | HIGH | Requires: Solana PoH timestamp verification, SHA-256 content hash proof, W3C PROV provenance chain, jurisdiction-specific legal formatting (Indonesia, Kenya, Colombia, WIPO). Currently placeholder only. |
| **Jurisdiction-aware formatting** | Evidence must format differently for Indonesian courts (Bahasa Indonesia, notarial conventions), WIPO (PCT/Hague standards), Kenyan IP office, Colombian SIC. No blockchain IP protocol does this. Story Protocol is US copyright law only (PIL based on US law). | HIGH | Unique to Mycelium. Requires legal templates per jurisdiction. Indonesia is the must-have (INFIA's home market). Others are v2. |
| **Perceptual similarity detection (pHash/Chromaprint)** | Beyond exact hash matching: detect near-duplicates, crops, re-encodes, style transfers. Story Protocol has no similarity detection at all. YouTube Content ID does this but is centralized and closed. A decentralized pHash registry on blockchain is novel (see arxiv.org/abs/2602.02412). | HIGH | Currently SHA-256 only (labeled misleadingly as "perceptual hash"). Needs real pHash for images, Chromaprint for audio. Python service required. |
| **MCP-native agent interface** | AI agents are the fastest-growing API consumer segment (Postman 2025). Story Protocol has SDK but no agent-native interface. Mycelium's MCP server lets Claude/GPT/Gemini register IP, check licenses, verify provenance directly. This is the AI-agent-first differentiator. | MEDIUM | 13 MCP tools already functional in mock mode. 6 working on devnet. Agent protocol manifests (A2A, UCP) declared. |
| **Sub-cent registration cost** | $0.004 on Solana vs Story Protocol's EVM gas costs. For Global South creators registering hundreds of social media posts, cost per registration matters enormously. | LOW | Inherent to Solana. Already achieved on devnet. |
| **No token / pure infrastructure** | Story Protocol has $IP token with unlock schedules, speculation, and governance politics. Mycelium is deliberately token-free. This makes it credible as infrastructure for legal evidence (courts will not accept evidence from a system with financial incentives to manipulate). | LOW | Already decided. Key architectural decision. Strengthens legal credibility. |
| **Multi-format IP support (11 types)** | Not just images/art. Supports: literary, musical, audiovisual, software, database, trademark, patent, trade_secret, design, character, performance. Broader than Story Protocol's focus on creative IP remixing. | LOW | Already implemented in Spore. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems for Mycelium specifically.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Protocol token ($MYCO)** | Every crypto project "needs a token." Investors expect it. | Destroys legal credibility of evidence packages. Courts will question impartiality of a system with financial incentives. Regulatory burden (securities law). Distracts from infrastructure mission. | Charge USDC fees for evidence generation and premium features. Revenue without speculation. |
| **Full WIPO integration API** | Automate filing directly to WIPO systems. | WIPO has no public API for automated filing. Their systems require manual submission. Building a fake "integration" creates liability. | Generate WIPO-formatted evidence packages for manual submission. Clear about what it does and doesn't do. |
| **On-chain content storage** | "Put the actual file on-chain for maximum decentralization." | Solana accounts have size limits. Storing media on-chain is prohibitively expensive and unnecessary. Content hash + Arweave URI provides the same guarantees. | Hash on-chain, content on Arweave. This is the industry standard (Story Protocol, IPwe all do this). |
| **Decentralized court system** | "Let token holders vote on disputes." Pure on-chain justice. | IP disputes require legal expertise, jurisdiction-specific knowledge, and real-world enforcement. Token voting produces mob justice, not legal rulings. Story Protocol's UMA oracle approach is already questionable. | Whitelisted arbiters (legal professionals) with on-chain execution of decisions. Hybrid model. |
| **Layer 3 semantic embeddings (CLIP/CLAP)** | "Detect conceptual similarity, not just visual." | Computationally expensive, requires GPU inference, model versioning complexity, false positive rates are high. Premature for v1. | Start with pHash (images) + Chromaprint (audio) for Layer 2. Defer semantic analysis to post-mainnet when there is enough data to justify the cost. |
| **Real-time infringement monitoring** | "Crawl the internet and detect unauthorized use." | Massive infrastructure cost. Legal liability for false positives. Competes with established players (Google Content ID, Audible Magic). Not Mycelium's core competency. | Provide similarity checking against the registry. Let users submit suspected infringements for comparison. React, don't proactively crawl. |
| **Cross-chain bridges for IP assets** | "Represent my Solana IP on Ethereum too." | Bridge exploits are a systemic risk (billions lost). IP provenance depends on a single canonical record. Duplicating IP across chains creates conflicting ownership claims. | Single canonical chain (Solana). Provide read-only verification endpoints for other chains via oracles if needed in v2+. |
| **Mobile app** | "Creators use phones." | Web + MCP covers all use cases. Mobile app is a maintenance burden with app store review delays. Progressive Web App gives mobile access without the overhead. | PWA or responsive web. MCP for agent access. |

## Feature Dependencies

```
[Content Hash Registration (Spore)]
    |
    +--requires--> [Metadata Storage (Arweave/Meridian)]
    |
    +--enables--> [Ownership Transfer]
    |                 |
    |                 +--requires--> [original_creator field fix]
    |
    +--enables--> [Derivative Registration]
    |                 |
    |                 +--enables--> [IP Graph / Provenance Chain]
    |
    +--enables--> [License Template Creation (Hypha)]
    |                 |
    |                 +--enables--> [License Acquisition]
    |                 |                 |
    |                 |                 +--requires--> [USDC Payment Integration]
    |                 |                 |
    |                 |                 +--enables--> [License Verification]
    |                 |
    |                 +--enables--> [Royalty Config (Rhizome)]
    |                                     |
    |                                     +--requires--> [USDC Payment Integration]
    |                                     |
    |                                     +--enables--> [Automated Royalty Distribution]
    |
    +--enables--> [Evidence Package Generation (Meridian)]
    |                 |
    |                 +--requires--> [PoH Timestamp Verification]
    |                 +--requires--> [Arweave Anchoring]
    |                 +--requires--> [Jurisdiction Templates]
    |                 +--requires--> [Ed25519 Signature Fix]
    |
    +--enables--> [Similarity Detection]
    |                 |
    |                 +--requires--> [pHash/Chromaprint Service (Python)]
    |                 +--enhances--> [Dispute Resolution]
    |
    +--enables--> [Dispute Resolution (DRP)]
                      |
                      +--requires--> [UpdateStatus Authority Fix]
                      +--requires--> [Dispute Tags + Evidence Submission]
                      +--enhances--> [Evidence Package Generation]

[Helius Indexer] --enables--> [Scalable Search]
                 --enables--> [Provenance Queries at Scale]

[Per-Agent Wallet Derivation] --enables--> [Multi-Agent MCP Usage]
                              --requires--> [BIP-44 Key Derivation]

[USDC Payment Integration] --enables--> [License Acquisition]
                           --enables--> [Royalty Distribution]
                           --enables--> [Evidence Package Fees]
```

### Dependency Notes

- **Evidence packages require everything upstream:** Registration, metadata, timestamps, signatures, and Arweave anchoring must all work before evidence generation is meaningful. This is the longest dependency chain and the highest-value feature.
- **USDC is a hard dependency for licensing and royalties:** SOL-only payments are a non-starter for commercial licensing. USDC integration must precede any production licensing.
- **Dispute resolution depends on UpdateStatus security fix:** The current any-signer bug means dispute resolution would be meaningless — anyone could override dispute tags.
- **Helius indexer is independent but blocking for scale:** Can be built in parallel but must ship before mainnet. Current `getProgramAccounts` scan will fail with >10K assets.
- **pHash service is independent but blocking for similarity:** Python service can be built in parallel. Without it, "similarity detection" is exact-match only (misleading).

## MVP Definition

### Launch With (v1 — Mainnet)

- [x] IP registration with content hash + timestamp (working, fix schema drift)
- [ ] `original_creator` field restored on-chain (critical for provenance)
- [ ] License template creation + acquisition + verification (Hypha live adapter)
- [ ] USDC payment integration (SPL token transfers)
- [ ] Royalty configuration + distribution with proper security constraints
- [ ] Evidence package generation — PDF with PoH timestamp, content hash proof, provenance chain (Indonesia + WIPO format minimum)
- [ ] Arweave metadata upload (replace placeholder paths)
- [ ] Dispute filing + resolution with whitelisted arbiters
- [ ] UpdateStatus authority constraint fix
- [ ] Helius indexer for search (replace getProgramAccounts)
- [ ] Per-agent wallet derivation (BIP-44)
- [ ] Ed25519 signature verification fix (Meridian)
- [ ] Anchor IDL client (replace 3 manual Borsh deserializers)

### Add After Validation (v1.x)

- [ ] Perceptual hash similarity detection — pHash for images, Chromaprint for audio (trigger: first duplicate dispute filed)
- [ ] Additional jurisdiction templates — Kenya, Colombia, Singapore (trigger: first non-Indonesian user)
- [ ] Batch registration API — register 100+ IPs in one transaction (trigger: INFIA onboarding 36+ IPs)
- [ ] License marketplace — browse and acquire available licenses (trigger: 100+ active license templates)
- [ ] Royalty analytics dashboard — revenue tracking per IP across the graph (trigger: first royalty distributions)
- [ ] Dispute evidence viewer — on-chain evidence gallery for dispute arbiters (trigger: first disputes filed)

### Future Consideration (v2+)

- [ ] Semantic similarity (CLIP/CLAP embeddings) — defer until pHash proves insufficient
- [ ] Cross-chain read-only verification via oracles — defer until demand from non-Solana ecosystems
- [ ] Automated derivative tagging (Story Protocol plans this but hasn't shipped it either)
- [ ] AI training data licensing module — programmatic licensing for AI model training datasets
- [ ] Patent-specific workflows (prior art search, claim mapping) — different domain from copyright/trademark

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Evidence package generation (PDF, Arweave, jurisdiction formatting) | HIGH | HIGH | P1 |
| Hypha live adapter (licensing CPI) | HIGH | MEDIUM | P1 |
| USDC payment integration | HIGH | MEDIUM | P1 |
| `original_creator` field restoration | HIGH | MEDIUM | P1 |
| UpdateStatus authority fix | HIGH | LOW | P1 |
| Ed25519 signature verification fix | HIGH | MEDIUM | P1 |
| Anchor IDL client generation | MEDIUM | MEDIUM | P1 |
| Rhizome security constraints fix | HIGH | LOW | P1 |
| Helius indexer integration | MEDIUM | MEDIUM | P1 |
| Dispute Resolution Program (DRP) | HIGH | HIGH | P1 |
| Per-agent wallet derivation (BIP-44) | MEDIUM | MEDIUM | P1 |
| Arweave/Irys metadata upload | MEDIUM | MEDIUM | P1 |
| Perceptual hash similarity (pHash) | HIGH | HIGH | P2 |
| Batch registration API | MEDIUM | MEDIUM | P2 |
| Additional jurisdiction templates | MEDIUM | MEDIUM | P2 |
| License marketplace UI | MEDIUM | MEDIUM | P2 |
| Royalty analytics dashboard | LOW | MEDIUM | P2 |
| Semantic similarity (CLIP/CLAP) | MEDIUM | HIGH | P3 |
| Cross-chain verification | LOW | HIGH | P3 |
| AI training data licensing module | MEDIUM | HIGH | P3 |

**Priority key:**
- P1: Must have for mainnet launch
- P2: Should have, add when validated by usage
- P3: Nice to have, future consideration

## Competitor Feature Analysis

| Feature | Story Protocol | IPwe | WIPO PROOF | Mycelium (target) |
|---------|---------------|------|------------|-------------------|
| IP Registration | EVM-based, IP Asset NFTs | Patent NFTs on IBM blockchain | Timestamp tokens (not registration) | Solana, $0.004, 400ms, 11 IP types |
| Licensing | PIL (Programmable IP License), 3 standard configs, custom terms | Patent licensing + sales + collateral | N/A | Hypha templates, configurable terms |
| Royalties | Royalty Module, ancestor revenue distribution | Patent revenue sharing | N/A | Rhizome, configurable splits |
| Dispute Resolution | Dispute Module, 5 tags, UMA oracle arbitration, whitelisted arbiters | N/A | N/A | DRP program, whitelisted arbiters (planned) |
| Evidence Generation | None | Patent analytics/valuation | Timestamp certificate only | Full evidence packages: PDF, PoH, jurisdiction formatting |
| Similarity Detection | None | AI patent analysis | None | pHash images, Chromaprint audio (planned) |
| Agent API | TypeScript SDK | Enterprise API | None | MCP server, 13 tools, A2A/UCP manifests |
| Token | $IP token, governance, speculation | N/A (enterprise SaaS) | N/A (WIPO service) | None (pure infrastructure) |
| Cost | EVM gas ($1-10+ per tx) | Enterprise pricing | CHF 20/token | $0.004 per registration (Solana) |
| Jurisdictions | US copyright law (PIL) | US patent law focus | 193 member states (manual) | Indonesia, WIPO, Kenya, Colombia (planned) |
| Target Users | Web3 creators, AI data providers | Enterprise patent holders | Any IP owner | Global South creators, AI agents, INFIA ecosystem |
| IP Graph | Full parent-child-remix graph | Patent citation graph | None | Derivative registration + provenance chain |

### What Story Protocol Has That Mycelium Needs

1. **Grouping Module** — Pool multiple IPs into a single licensable group. Useful for INFIA bundling 36+ IPs. Consider for v1.x.
2. **Standard license configurations** — Story has Non-Commercial Social Remixing, Commercial Use, Commercial Remix as presets. Mycelium should ship 3-5 preset templates.
3. **Derivative propagation** — When parent IP gets disputed, derivatives auto-tagged. Story plans this, hasn't shipped. Mycelium should plan for it.

### What Mycelium Has That Story Protocol Does Not

1. **Evidence packages** — Story has zero legal evidence generation capability.
2. **Similarity detection** — Story has zero content comparison capability.
3. **Jurisdiction awareness** — Story is US-only (PIL based on US copyright law).
4. **MCP agent interface** — Story has SDK only, no agent-native protocol.
5. **No token** — Credibility advantage for legal use cases.
6. **Sub-cent cost** — Solana vs EVM economics.

## What Courts and Legal Teams Actually Need from Blockchain Evidence

Based on research into court admissibility standards (US FRE, EU eIDAS, China's Hangzhou Internet Court, WIPO guidance):

### Must-Have for Admissibility

1. **Authentication** — Proof the evidence is what it claims to be (FRE 901). The blockchain record must be linked to a verified source.
2. **Integrity** — Cryptographic hash confirms no modification since capture. SHA-256 of the original file, stored immutably.
3. **Chain of custody** — Every access, transfer, and modification documented. Audit trail from creation to court presentation.
4. **Timestamp verification** — Independent, verifiable timestamp. Solana's Proof of History provides this natively. Adding RFC 3161 qualified timestamp from a QTSP adds a second legal layer (especially for EU eIDAS compliance).
5. **Expert-friendly format** — PDF reports with clear methodology explanation. Courts expect transparent, narrowly-scoped technical explanations.
6. **Separation of technical and legal claims** — The evidence package proves "this file existed at this time with this hash." It does NOT prove "this person owns the copyright." Courts make that determination.

### Jurisdiction-Specific Requirements

- **Indonesia:** Evidence must be in Bahasa Indonesia for domestic courts. Electronic evidence recognized under UU ITE (Undang-Undang Informasi dan Transaksi Elektronik).
- **EU:** eIDAS regulation recognizes qualified electronic ledgers. ETSI EN 319 401 and ISO 23257:2022 standards for qualified timestamp providers.
- **US:** FRE 901 authentication, FRE 803 business records exception, Daubert standard for expert methodology.
- **China:** Hangzhou Internet Court's blockchain evidence platform used routinely for copyright disputes since 2018. Most mature jurisdiction for blockchain evidence.
- **WIPO:** WIPO PROOF service provides timestamp tokens. Mycelium evidence packages should be formatted to complement (not replace) WIPO procedures.

### What NOT to Claim

- Do NOT claim the blockchain record "proves ownership." It proves existence at a point in time.
- Do NOT claim the system is "legally binding." Smart contracts are not contracts in most jurisdictions.
- Do NOT claim evidence is "tamper-proof." Claim it is "tamper-evident" (you can detect if it was modified).

## What AI Agents Need from an IP Licensing API

Based on research into agent API design patterns and Postman's 2025 State of API Report:

### Must-Have for Agent Consumption

1. **Machine-readable license terms** — JSON schema for all license parameters (commercial use, derivatives, attribution, territory, revenue share %). Agents cannot parse natural language license agreements.
2. **Deterministic responses** — Same input always produces same output. No ambiguous states. Error codes, not error messages.
3. **Atomic operations** — Register, license, verify as single API calls. Agents should not need multi-step workflows with intermediate state management.
4. **Capability discovery** — MCP tool manifests that declare what the agent can do, what parameters are required, what responses look like. Already implemented in Mycelium.
5. **Verification before action** — `check_license` before `acquire_license`. Agents need to verify state before committing transactions.
6. **Cost transparency** — Agent must know the cost of each operation before executing. USDC amount, SOL fees, all predictable.
7. **Batch operations** — Register 10 IPs in one call. Agents process at scale.
8. **Idempotency** — Retrying a failed registration should not create duplicates.

### Nice-to-Have for Agent Workflows

- Webhook notifications when license terms change or disputes are filed
- Streaming provenance queries for large IP graphs
- Natural language query interface for search (semantic search over metadata)

## Sources

- [Story Protocol PIL Documentation](https://docs.story.foundation/concepts/programmable-ip-license/overview) — HIGH confidence
- [Story Protocol Dispute Module](https://docs.story.foundation/concepts/dispute-module/overview) — HIGH confidence
- [Story Protocol Whitepaper](https://www.story.foundation/whitepaper.pdf) — HIGH confidence
- [WIPO Blockchain and IP White Paper](https://www.wipo.int/documents/d/cws/docs-en-blockchain-for-ip-ecosystem-whitepaper.pdf) — HIGH confidence
- [WIPO Blockchain IP Article](https://www.wipo.int/en/web/wipo-magazine/articles/blockchain-transforming-the-registration-of-ip-rights-and-strengthening-the-protection-of-unregistered-ip-rights-55817) — HIGH confidence
- [Blockchain Evidence Admissibility (Frontiers 2026)](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2026.1783805/full) — MEDIUM confidence
- [TRM Labs: Building Strong Cases with Blockchain Evidence](https://www.trmlabs.com/resources/blog/building-strong-cases-with-blockchain-evidence-admissibility-chain-of-custody-experts-and-court-ready-reporting) — MEDIUM confidence
- [Perceptual Hash Registry on Blockchain (arxiv 2025)](https://arxiv.org/abs/2602.02412) — MEDIUM confidence
- [Blockchain Evidence in US Courts (Frontiers 2024)](https://www.frontiersin.org/journals/blockchain/articles/10.3389/fbloc.2024.1306058/full) — MEDIUM confidence
- [IPwe Patent Tokenization](https://www.ibm.com/case-studies/ipwe) — MEDIUM confidence
- [Postman 2025 State of API Report — AI Agent API Design](https://blog.apilayer.com/ai-agents-are-the-new-users-of-your-api-how-to-make-your-api-agent-ready/) — MEDIUM confidence
- [Blockchain IP Protection Market Report 2025](https://www.globenewswire.com/news-release/2026/04/09/3270739/0/en/Blockchain-for-Intellectual-Property-Protection-Market-Research-Report-2025-Immutable-Records-Smart-Contracts-and-Tokenization-Addressing-Vulnerabilities-and-Enabling-New-Monetizat.html) — LOW confidence

---
*Feature research for: Mycelium Protocol — on-chain IP infrastructure*
*Researched: 2026-04-12*
