# Appendix 03 — WIPO CWS Task 59 Compatibility Matrix

*Companion to the Jakarta Protocol WIPO Submission, October 2026*

---

## Context

The Committee on WIPO Standards (CWS) established a Blockchain Task Force (subsequently designated Task 59) with the mandate to draft a new WIPO standard supporting blockchain applications in IP ecosystems. WIPO's 2025 whitepaper *"Blockchain technologies and IP ecosystems"* enumerated the core areas of concern: interoperability, governance, regulation, timestamp reliability, data integrity, privacy, scalability, and integration with existing IP procedures.

This matrix maps each Task 59 concern to the Jakarta Protocol's explicit response. The purpose is to make the Protocol legible as an input to the Task Force's deliberations, not to pre-empt them.

---

## Matrix

### 1. Interoperability across IP Offices

| | |
|---|---|
| Task 59 concern | Blockchain solutions tend to silo IP data within proprietary ecosystems, fragmenting what should be globally interoperable IP infrastructure. |
| Jakarta Protocol response | The MEP schema (§4 of main submission) is a canonical JSON document with WIPO Nice, Berne, and ISO 3166 fields as first-class members. The schema is chain-agnostic: a compliant registration on any chain can emit a valid MEP. |
| Evidence in reference impl | `mycelium_spore::register_ip` includes `nice_class: Option<u8>`, `berne_category: Option<u8>`, `country_of_origin: [u8; 2]` as on-chain fields. See `programs/mycelium-spore/src/lib.rs` lines 59–98. |
| CWS adoption path | Schema published under CC-BY 4.0; available for CWS direct adoption or adaptation. |

### 2. Governance and Regulation

| | |
|---|---|
| Task 59 concern | Who controls the protocol? How are changes made? How are bad actors excluded? |
| Jakarta Protocol response | §9 of main submission: 3-of-5 Squads multisig with 5 declared seats including rotating ASEAN creator, rotating Global South legal scholar, and non-voting WIPO observer. v2+ changes require 180-day RFC and 4-of-5 approval. |
| Evidence in reference impl | Multisig setup documented at `docs/multisig-setup.md`. Authority-transfer script at `docs/authority-transfer.sh`. |
| CWS adoption path | Governance charter published under CC-BY 4.0; WIPO observer seat declared and reserved. |

### 3. Data Integrity and Non-Repudiation

| | |
|---|---|
| Task 59 concern | Cryptographic guarantees must be strong enough to serve as evidence. Integrity must be verifiable across custody chains. |
| Jakarta Protocol response | SHA-256 content hashing (FIPS 180-4). Ed25519 signatures (RFC 8032). Arweave permanent storage for MEP documents. On-chain anchoring via Solana Proof of History. Explicit verification procedure in MEP document. |
| Evidence in reference impl | `mycelium_meridian::generate_mep` parses the Ed25519 verification instruction data and rejects any mismatch between the signed message and stored `package_hash`. See `programs/mycelium-meridian/src/lib.rs` lines 72–140. A presence-only signature check is explicitly insufficient. |
| CWS adoption path | Cryptographic primitives are all FIPS / RFC standards — no novel crypto. |

### 4. Timestamp Reliability

| | |
|---|---|
| Task 59 concern | Timestamps must be deterministic, non-manipulable, and usable as evidence of priority. |
| Jakarta Protocol response | Solana Proof of History provides native cryptographic timestamps from the slot leader itself. Spec also admits any chain with deterministic block ordering and ≥64-bit slot/block numbers. |
| Evidence in reference impl | Spore stores `registration_slot: u64` from `Clock::get()?.slot` at instruction execution. This is the PoH-attested ordering, not a node-local clock reading. |
| CWS adoption path | Precedent: Hangzhou Internet Court 2018 (blockchain timestamps admissible); Marseille Tribunal March 2025 (blockchain timestamp = copyright evidence); multiple US state statutes. |

### 5. Identity Management

| | |
|---|---|
| Task 59 concern | On-chain identity is typically a pseudonymous public key. IP rights attach to legal persons. How is the bridge made? |
| Jakarta Protocol response | Creator identity is an Ed25519 public key at the protocol level. The MEP document optionally binds that key to a legal identity via an attestation (`creator_identity_attestation`) — e.g., a DJKI-registered trademark certificate, a W3C DID, or a C2PA content credential. Identity binding is declarative and verifiable, not mandated. |
| Evidence in reference impl | The reference MEP document (Appendix 02) shows `creator_identity_attestation` bound to `NKK-TM-2021-0042` (PT NKK's DJKI trademark registration). |
| CWS adoption path | Compatible with W3C DID (did:web, did:key), C2PA content credentials, and existing IP-office identity schemes. |

### 6. Scalability

| | |
|---|---|
| Task 59 concern | Any IP standard must scale to billions of IP assets without prohibitive cost or latency. |
| Jakarta Protocol response | Solana reference impl supports 65,000 TPS; registrations confirm in 400ms; cost is USD 0.004 per transaction. Spec imposes no TPS or cost cap — a different chain with different tradeoffs can emit valid MEPs. |
| Evidence in reference impl | Devnet `mycelium_spore` deployed, handling full registration flow. Scalability ceiling is chain-level, not protocol-level. |
| CWS adoption path | Spec scales at whatever rate the underlying chain supports. Chain choice is left to implementer. |

### 7. Integration with Existing IP Procedures

| | |
|---|---|
| Task 59 concern | Blockchain evidence must be usable within existing national IP office and court procedures, not require new treaty negotiation. |
| Jakarta Protocol response | §7 Recognition Procedure maps MEPs directly onto existing electronic-evidence frameworks: UU ITE Pasal 5 (Indonesia), Evidence Act §106B (Kenya), Ley 527 Art 5/11/12 (Colombia), WIPO Arbitration electronic submission procedures. No new legislation required. |
| Evidence in reference impl | Jurisdiction adapters planned in `evidence-engine/jurisdiction/{indonesia,kenya,colombia,wipo,china,usa_federal,uk}.ts`. Legal playbook at `docs/Mycelium_Legal_Integration_Playbook.md`. |
| CWS adoption path | Recognition Procedure is explicitly "supplementary evidence" — no statutory right is claimed from MEP alone. Complements, does not substitute for, national registries. |

### 8. Privacy

| | |
|---|---|
| Task 59 concern | On-chain data is public. IP metadata may contain trade secrets or personal data. How is privacy preserved? |
| Jakarta Protocol response | Content itself is never on-chain. Only hashes (SHA-256, perceptual) and a metadata URI are anchored. Creators choose what metadata to include in the off-chain document. Perceptual hashes can be omitted at creator's option (with understanding that similarity-matching is disabled). |
| Evidence in reference impl | Spore stores 32-byte content hash only. All content, descriptions, and media live in Arweave-hosted metadata JSON. |
| CWS adoption path | Aligns with GDPR, UU PDP (Indonesia), and LGPD (Brazil) — no personal data on-chain by default. |

### 9. Regulatory Alignment

| | |
|---|---|
| Task 59 concern | How does the protocol interact with securities, money-transmitter, tax, and AML/KYC regulations? |
| Jakarta Protocol response | No token means no securities exposure. USDC is a regulated fiat-backed stablecoin (NYDFS, issued by Circle). Protocol does not take custody of user funds — it orchestrates direct on-chain transfers. KYC is at the fiat-onramp layer (Circle), not at the protocol layer. |
| Evidence in reference impl | Rhizome program routes royalty payments atomically, never holding funds in protocol-controlled accounts longer than a single transaction. |
| CWS adoption path | Regulatory stance inherited from Solana + USDC + Circle — no novel regulatory posture the protocol must defend. |

### 10. AI and Copyright Vacuum

| | |
|---|---|
| Task 59 concern | WIPO has not set AI-and-IP norms since 2019. Any modern standard must address AI training and AI-generated content. |
| Jakarta Protocol response | (a) Mandatory `ai_training_allowed` boolean on every licence template — the minimum machine-readable answer. (b) `IPType::AIGenerated` enum variant for AI-generated works. (c) C2PA provenance bridge for content authenticity. (d) `IPType::Dataset` enum variant for training data licensing. |
| Evidence in reference impl | `mycelium_hypha::LicenseTemplate::ai_training_allowed` is a required field. See `programs/mycelium-hypha/src/lib.rs` line 216. |
| CWS adoption path | Provides the schema Task 59 would otherwise need to define; aligns with C2PA industry coalition (Adobe, Microsoft, BBC, Intel). |

### 11. Traditional Knowledge

| | |
|---|---|
| Task 59 concern | WIPO's 2024 Diplomatic Conference treaty on Genetic Resources and Associated Traditional Knowledge establishes new normative obligations. Standards must accommodate. |
| Jakarta Protocol response | `IPType::TraditionalKnowledge` enum variant as a first-class IP type. Pilot-community governance roadmap in v1.1 requires community consent attestation before TK registration. Community representatives receive a seat in the §9 governance structure for TK-related decisions. |
| Evidence in reference impl | IPType enum includes `TraditionalKnowledge`. See `programs/mycelium-spore/src/lib.rs` line 26 (referenced). |
| CWS adoption path | Directly aligned with 2024 Diplomatic Conference treaty; consent mechanism provides the procedural bridge Task 59 will need. |

### 12. Cross-Border Enforcement

| | |
|---|---|
| Task 59 concern | IP is born multinational. Enforcement fragments across jurisdictions. |
| Jakarta Protocol response | Each MEP is generated for a declared `target_jurisdiction`. The same on-chain IP asset can produce MEPs for Indonesia, Kenya, Colombia, or WIPO Arbitration — each formatted to the destination's evidentiary requirements. Cross-jurisdictional evidence re-use is built in. |
| Evidence in reference impl | `mycelium_meridian::Jurisdiction` enum: Indonesia, Kenya, Colombia, WIPOArbitration, International. Planned extensions: China Internet Court, US Federal (FRE 901/902), UK (Practice Direction 31B), EU (eIDAS). |
| CWS adoption path | Jurisdiction adapter pattern permits unilateral addition of new jurisdictions by any implementer without protocol-level changes. |

### 13. Economic Sustainability

| | |
|---|---|
| Task 59 concern | A standard that relies on VC subsidy is not durable. A standard that relies on a token is not regulatorily clean. |
| Jakarta Protocol response | Self-sustaining revenue model: SOL rent on registrations, USDC protocol fees on royalty distributions (0.5%), USDC evidence package fees, enterprise API subscriptions. 10% of revenue flows to the Global South Access Fund — a separate legal entity with independent governance. |
| Evidence in reference impl | Revenue model detailed in PRD (`Mycelium_Protocol_PRD.md`). Registration cost analysis in `docs/registration-cost.md`. |
| CWS adoption path | No dependency on VC funding or token appreciation; revenue mechanism operates regardless of WIPO adoption. |

### 14. Auditability

| | |
|---|---|
| Task 59 concern | An IP standard must be independently auditable — both the code and the economic flows. |
| Jakarta Protocol response | (a) All reference-implementation code MIT-licensed; anyone can audit. (b) OtterSec audit scheduled Q3 2026 prior to mainnet activation. (c) Immunefi bug bounty at mainnet. (d) All protocol economic flows are on-chain and indexed by Helius; anyone with a Solana Explorer can trace them. (e) Access Fund disbursements are independently audited annually with published recipient list. |
| Evidence in reference impl | Full source in `programs/**/src/lib.rs`. Deployment addresses in `Anchor.toml`. |
| CWS adoption path | Open-source + formal audit + on-chain transparency = maximum-auditability posture compatible with standards-body engagement. |

---

## Summary

Across the 14 concerns enumerated by WIPO CWS Task 59 — drawn from the Task Force mandate, the 2025 blockchain whitepaper, and the broader WIPO IP-and-blockchain agenda — the Jakarta Protocol provides a direct architectural response backed by a deployed reference implementation. No concern is left unaddressed at the specification level.

This does not mean the Jakarta Protocol is the answer. It means it is a credible input. The Task Force is the appropriate body to evaluate, adapt, and potentially adopt elements of the specification. The Protocol's CC-BY 4.0 licence makes that process frictionless.

---

*End of Appendix 03.*
