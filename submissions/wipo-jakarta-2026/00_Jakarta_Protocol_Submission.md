---
title: "The Jakarta Protocol — A WIPO-Compatible On-Chain Evidence Standard for Programmable Intellectual Property"
version: 1.0
date: 2026-04-19
status: Submission Draft
author: Aji Pratomo, INFIA Group / Mycelium Network
target_venue: WIPO CWS Blockchain Task Force — Jakarta Regional Session, October 2026
target_bodies: [WIPO CWS, DJKI Indonesia, ASEAN IP Working Group]
reference_implementation: Mycelium Network (Solana devnet + mainnet-beta)
license: CC-BY 4.0 (proposal text) / MIT (reference code)
---

# The Jakarta Protocol

**A WIPO-Compatible On-Chain Evidence Standard for Programmable Intellectual Property**

*Submission to WIPO CWS Blockchain Task Force — Jakarta Regional Session, October 2026*

---

## 0. One-Page Summary

**What this is.** A proposed standard — the **Jakarta Protocol** — defining a minimal, neutral, chain-agnostic specification for on-chain intellectual property evidence that national IP offices, courts, and WIPO can rely on without endorsing any specific blockchain, token, or commercial platform.

**Why Jakarta.** Indonesia has the legal preconditions (UU ITE Pasal 5, Putusan MK 20/PUU-XIV/2016) and the political will (DJKI digitisation roadmap, Bankable IP initiative) to be the first WIPO member state to formally recognise on-chain evidence packages. ASEAN creator economies — 680M people, $57B digital content market — need infrastructure the Madrid Protocol cannot give them at $730 per filing.

**What it does.**

1. Defines a standard **Mycelium Evidence Package (MEP)** JSON schema — a W3C PROV-compliant, WIPO Nice/Berne-tagged, jurisdiction-aware dossier any chain can emit and any court can verify with a web browser.
2. Specifies a **reference implementation** on Solana (five Anchor programs, production-deployed) with the full stack open-sourced under MIT.
3. Establishes an **interop profile** with WIPO CWS Task Force on Blockchain (Task 59), Nice Classification (11th ed.), Berne categories, and ISO 3166 country codes.
4. Proposes a **WIPO Recognition Procedure** — the minimum evidentiary bar that makes an MEP admissible as supplementary electronic evidence under UU ITE, Kenyan Evidence Act §106B, Colombian Ley 527, and WIPO Arbitration procedure.

**What it is not.** A token. A competing registry. A replacement for WIPO. A platform lock-in. A single-chain specification.

**Why this is different from Story Protocol.** Story tokenises IP as a financial instrument on a proprietary L1 funded by $140M in venture capital and gated by a volatile $IP token. The Jakarta Protocol treats IP as public infrastructure: USDC and fiat onramps, standard agent protocols (MCP + A2A + UCP), court-ready evidence packages in eight jurisdictions, zero token, zero chain lock-in. Story's Agent TCP/IP is a custom protocol nobody adopted. The Jakarta Protocol uses the ones 97M+ agents already speak. See §8 for the full comparison.

**Ask.** (1) WIPO CWS Blockchain Task Force to review the MEP schema as input to Task 59. (2) DJKI to pilot MEP as supplementary evidence in one Commercial Court case in 2027. (3) ASEAN IP Working Group to adopt the MEP schema as a regional interop baseline.

**Reference implementation status.** Five Solana programs live on devnet (addresses in §12). `mycelium_spore` (registration), `mycelium_hypha` (licensing), `mycelium_rhizome` (royalties), `mycelium_meridian` (evidence), `mycelium_drp` (dispute resolution). All code MIT-licensed at [github.com/infia-group/mycelium-network](https://github.com/infia-group/mycelium-network).

---

## 1. The Access Gap WIPO Cannot Close Alone

### 1.1 The filing economics

A Madrid Protocol filing costs USD 730 base, plus supplementary and complementary fees per designated country, plus class fees per Nice class beyond the first. A standard 10-country, 3-class filing lands between USD 4,500 and USD 12,000 before local counsel. National-phase PCT entry to ten jurisdictions routinely exceeds USD 100,000.

For the 3.2 billion people living in countries classified by the World Bank as lower-middle-income or below, these fees are not negotiable. They are prohibitive. A meme creator in Jakarta, a fabric designer in Nairobi, a character artist in Medellín creates IP daily and files none of it.

The gap is not solved by reducing WIPO fees by 20% — the median creator earns under USD 300 per month. It is solved by a parallel infrastructure with a different cost structure.

Solana produces cryptographically timestamped evidence at USD 0.004 per registration, finalised in 400ms. That is the economics of the Global South creator economy. It cannot be WIPO's economics — but WIPO can recognise it.

### 1.2 The enforcement gap

WIPO registers rights. It does not enforce them. Enforcement happens in:

- National courts applying national evidence rules (UU ITE in Indonesia, Evidence Act §106B in Kenya, Ley 527 in Colombia).
- Platform takedown systems (YouTube Content ID, Meta Rights Manager, TikTok IP portal) which apply private standards.
- Bilateral trade dispute settlement, which is expensive and slow.

A creator with a Madrid Protocol certificate has no automated path to enforcement on YouTube. A creator with a Solana registration plus a properly formatted MEP has a structured evidence package any of those systems can ingest. This submission proposes that WIPO recognise the latter as a valid *supplementary* evidence form — not a replacement for Madrid, a complement.

### 1.3 The AI training vacuum

WIPO has not set an AI-and-IP norm since 2019. No convention defines whether AI training on copyrighted work is fair use, requires licence, or requires opt-in. Meanwhile, AI companies scraped the entire indexable web for training data without compensation, and the Global South bore the cost disproportionately: local-language content, underrepresented in Western fair-use jurisprudence, was ingested without recourse.

The Jakarta Protocol includes a machine-readable `ai_training_allowed` flag on every licence template. An AI agent with an MCP client can programmatically check the flag before ingestion. The protocol does not mandate the answer; it mandates that the question be answerable *without a lawyer*. This is the minimum WIPO should require of any on-chain IP standard.

### 1.4 The central-attack vulnerability

The Madrid System has a structural fragility: if the basic home registration falls (revocation, non-use cancellation, bad-faith challenge), the international registration collapses in all 130+ designated countries during the dependency period. This was documented in the 2019 review; no fix has shipped.

A distributed evidence layer does not replace Madrid. It does mean that a creator whose home registration is attacked retains independent cryptographic proof of prior creation and prior use, usable in any court that accepts electronic evidence — which now includes all WIPO member states, following the 2005 UNCITRAL Model Law.

### 1.5 The governance-capture risk

74.7% of WIPO's 2024–25 budget comes from PCT filing fees, overwhelmingly from applicants in high-income countries. A structural incentive exists to maximise filings, not to question whether the filing system serves the creators who cannot afford it.

The Jakarta Protocol's revenue model is explicit: 10% of protocol revenue flows to a Global South Access Fund, independently governed, that subsidises registrations and dispute resolution for creators in World Bank LMIC and LIC jurisdictions. This is a design feature, not an afterthought.

---

## 2. Proposal Overview

The Jakarta Protocol consists of four normative components:

| Component | Purpose | Status |
|---|---|---|
| **§4 MEP Schema** | Canonical JSON schema for the Mycelium Evidence Package | Proposed v1.0 |
| **§5 Registration Profile** | Minimum fields an on-chain IP registration must emit to produce a valid MEP | Proposed v1.0 |
| **§6 Licensing Profile** | Minimum fields a programmable IP licence must expose to satisfy the protocol | Proposed v1.0 |
| **§7 Recognition Procedure** | Procedure by which a national IP office or court recognises an MEP as supplementary evidence | Proposed v1.0 |

All four are chain-neutral. They constrain data, not implementation. A non-Solana chain emitting a valid MEP is equally compliant. The Mycelium Network reference implementation is offered to accelerate adoption, not to monopolise it.

---

## 3. Design Principles

### 3.1 Completes, does not compete

The Protocol explicitly treats WIPO-administered registries (Madrid, PCT, Hague, Lisbon) as the authoritative source for statutory rights. The Jakarta Protocol adds a second, complementary layer: continuous cryptographic evidence of creation, use, licensing, and royalty distribution, timestamped at a precision (400ms) and cost (USD 0.004) the statutory system cannot reach.

An MEP is never a substitute for a registered trademark. It is a second witness.

### 3.2 Chain-neutral

The MEP schema is defined in JSON Schema draft 2020-12. Any blockchain that can produce (a) a deterministic cryptographic timestamp, (b) a content-addressed identifier, and (c) a verifiable signature can emit a valid MEP. The reference implementation uses Solana for Proof of History advantages (§12), but an Ethereum, Polygon, or Polkadot-based implementation is equally valid.

### 3.3 No token, no gate

The Protocol is denominated in protocol-native gas (SOL for the Solana reference) plus USDC for paid features. No protocol token exists, is planned, or is permitted. A standard that requires holding a volatile asset to use it cannot be global public infrastructure. This is a hard constraint.

### 3.4 Court-verifiable with a web browser

Every MEP must be verifiable by a non-technical judge with a web browser and no specialised software. The MEP document includes plain-language verification instructions, direct Solana Explorer URLs, and a one-click hash recomputation against Arweave. If a court cannot verify the MEP in under 15 minutes without training, the design has failed.

### 3.5 Jurisdiction-aware by default

An MEP is generated for a specific jurisdiction (Indonesia, Kenya, Colombia, WIPO Arbitration, or International) and formatted to that jurisdiction's evidentiary requirements. Bahasa Indonesia for DJKI, English for KIPI, Spanish for SIC. The same on-chain record can produce multiple MEPs; each carries the jurisdiction tag.

### 3.6 AI-native

Every MEP tool must be accessible to AI agents through the Model Context Protocol (MCP), Agent2Agent (A2A), and Universal Commerce Protocol (UCP). No custom agent protocol is permitted. This is the protocol-level analogue of §3.3 — the Jakarta Protocol refuses vendor lock-in at every layer.

### 3.7 Global South access fund

10% of all protocol revenue flows to an independently governed Global South Access Fund. The Fund subsidises registration and dispute resolution for creators in LMIC/LIC jurisdictions, funds court-evidence training for judges, and supports translation of MEP templates into ASEAN, African Union, and Andean Community languages.

---

## 4. The Mycelium Evidence Package (MEP)

### 4.1 Definition

A Mycelium Evidence Package is a signed JSON document, permanently stored at a content-addressed URI (Arweave in the reference implementation), whose SHA-256 hash is anchored on a public blockchain with a verifiable cryptographic signature from a declared protocol authority.

### 4.2 Schema (v1.0)

```json
{
  "$schema": "https://jakarta-protocol.org/schema/mep/v1.0.json",
  "mep_version": "1.0",
  "package_hash": "sha256-hex of this document minus the package_hash field itself",
  "protocol_signature": "ed25519 signature of package_hash by protocol_authority",
  "protocol_authority": "ed25519 public key of the signing authority",

  "ip_asset": {
    "chain": "solana-mainnet-beta",
    "program_id": "GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR",
    "pda_address": "base58 Solana address of the IPAsset PDA",
    "content_hash": "sha256 of the original content",
    "perceptual_hash": "phash-256 bits for similarity matching",
    "registration_slot": 0,
    "registration_timestamp_utc": "2026-04-19T07:32:14Z",
    "ip_type": "VisualArt",
    "original_creator_pubkey": "base58",
    "current_creator_pubkey": "base58",
    "metadata_uri": "ar://metadata-tx-id",
    "wipo_metadata": {
      "nice_class": 41,
      "berne_category": 4,
      "country_of_origin_iso3166": "ID",
      "first_use_date_utc": "2026-01-15"
    }
  },

  "provenance": {
    "@context": "https://www.w3.org/ns/prov",
    "entity": {
      "id": "mycelium:ip:<pda_address>",
      "type": "prov:Entity",
      "wasGeneratedBy": "mycelium:registration:<slot>",
      "wasAttributedTo": "mycelium:creator:<original_creator_pubkey>"
    },
    "activity": {
      "id": "mycelium:registration:<slot>",
      "type": "prov:Activity",
      "startedAtTime": "2026-04-19T07:32:14Z",
      "endedAtTime": "2026-04-19T07:32:14Z",
      "used": "mycelium:content:<content_hash>"
    },
    "derivative_chain": [],
    "parent_ip": null
  },

  "license_history": [
    {
      "license_pda": "base58",
      "template_pda": "base58",
      "licensee_pubkey": "base58",
      "license_type": "Commercial",
      "royalty_rate_bps": 500,
      "territory": "ASEAN",
      "issued_at_utc": "2026-03-01T00:00:00Z",
      "expires_at_utc": "2027-03-01T00:00:00Z",
      "status": "Active",
      "ai_training_allowed": false
    }
  ],

  "royalty_history": {
    "config_pda": "base58",
    "total_deposited_lamports": 0,
    "total_distributed_lamports": 0,
    "distribution_count": 0,
    "recipients": [
      { "wallet": "base58", "share_bps": 9500, "role": "Creator" },
      { "wallet": "base58", "share_bps": 500, "role": "Platform" }
    ]
  },

  "dispute_history": [],

  "jurisdiction_format": {
    "target_jurisdiction": "Indonesia",
    "legal_basis": "UU ITE Pasal 5 + Putusan MK No. 20/PUU-XIV/2016",
    "language": "id-ID",
    "court_format": "Pengadilan Niaga — Commercial Court",
    "expert_witness_declaration_included": true,
    "verification_instructions_included": true
  },

  "verification": {
    "explorer_url": "https://explorer.solana.com/address/<pda_address>?cluster=mainnet-beta",
    "arweave_url": "https://arweave.net/<metadata_tx_id>",
    "reproduction_steps": [
      "1. Open the explorer_url and confirm the registration_slot matches",
      "2. Open arweave_url and compute SHA-256 of the returned bytes",
      "3. Confirm computed hash equals content_hash",
      "4. Verify protocol_signature against protocol_authority using Ed25519",
      "5. Recompute package_hash by SHA-256 of this document with package_hash field removed"
    ]
  },

  "generated_at_utc": "2026-04-19T07:35:00Z",
  "generated_by_agent": "mycelium-meridian-v1",
  "superseded_by": null
}
```

### 4.3 Normative rules

- The `package_hash` field MUST be computed over the document with `package_hash` set to empty string, then inserted.
- `protocol_signature` MUST be an Ed25519 signature over `package_hash`.
- `protocol_authority` MUST be verifiable against a declared public key registered with the Protocol (initially a multisig; §9).
- All timestamps MUST be ISO 8601 UTC.
- `jurisdiction_format.target_jurisdiction` MUST be one of the values enumerated in §7.
- The document MUST be retrievable at `verification.arweave_url` for at least 200 years (Arweave economic endowment).
- If any field is updated, a new MEP MUST be generated with incremented version and the prior MEP's `superseded_by` field pointed to the new PDA. Prior MEPs remain valid historical evidence.

### 4.4 Cryptographic requirements

- Content hashing: SHA-256 (FIPS 180-4).
- Perceptual hashing: pHash 256-bit (for image/video); Chromaprint (for audio); SimHash 128-bit (for text). Exact algorithm choice is declared in the IPAsset metadata.
- Signature: Ed25519 (RFC 8032).
- Blockchain anchoring: Any chain with finalised deterministic ordering and ≥64-bit slot/block numbers.

---

## 5. Registration Profile

A Jakarta-compliant registration transaction MUST emit, on-chain and in an indexer-retrievable event, the following fields:

| Field | Type | Normative | Notes |
|---|---|---|---|
| `content_hash` | 32 bytes | MUST | SHA-256 of original content |
| `perceptual_hash` | 32 bytes | MUST | Algorithm declared in metadata |
| `original_creator` | pubkey | MUST | Immutable after registration |
| `registration_slot` | u64 | MUST | Chain-native deterministic ordering |
| `registration_timestamp` | i64 | MUST | Unix epoch seconds |
| `ip_type` | enum | MUST | One of: LiteraryWork, VisualArt, Music, Software, CharacterIP, Meme, Video, AIGenerated, TraditionalKnowledge, Dataset, BrandMark |
| `metadata_uri` | string | MUST | Content-addressed, permanent-storage URI (Arweave, IPFS with pinning SLA, or equivalent) |
| `nice_class` | u8 | SHOULD | WIPO Nice Classification (1-45) |
| `berne_category` | u8 | SHOULD | WIPO Berne category (1-9) |
| `country_of_origin` | ISO 3166-1 α2 | SHOULD | Two-byte country code |
| `first_use_date` | i64 | MAY | Unix timestamp of first public use |
| `parent_ip` | pubkey / null | MAY | For derivatives |

The **duplicate-content-hash rule**: a registration with an existing `content_hash` MUST be rejected by the chain (the reference implementation uses a `content_hash_registry` PDA). This prevents replay registration of existing works by third parties.

The **original-creator-immutability rule**: `original_creator` MUST NOT change after registration. Ownership transfers update a separate `current_creator` field and MUST leave an on-chain audit trail.

---

## 6. Licensing Profile

A Jakarta-compliant licence template MUST expose:

| Field | Type | Normative |
|---|---|---|
| `ip_asset` | pubkey | MUST |
| `licensor` | pubkey | MUST |
| `license_type` | enum | MUST — one of: CreativeCommons, Commercial, Exclusive, AITraining (additional types permitted as extensions) |
| `royalty_rate_bps` | u16 | MUST — 0 to 10000 basis points |
| `territory` | enum | MUST — Global, ASEAN, EU, NAFTA, ISO 3166 α2 country, or Custom |
| `duration_seconds` | i64 / null | MUST |
| `commercial_use` | bool | MUST |
| `ai_training_allowed` | bool | MUST |
| `max_sublicenses` | u32 | SHOULD |

The **AI training flag is normative.** Every licence template MUST declare whether AI training on the licensed content is permitted. This is the minimum machine-readable answer a platform or AI agent must be able to obtain to operate in compliance with the protocol.

A licence issued under a template inherits all of these fields at issuance time and MUST NOT mutate them. If terms change, the template is deactivated and a new template is created.

---

## 7. Recognition Procedure

### 7.1 What a national IP office / court is being asked to recognise

A Jakarta-compliant MEP is a **supplementary** item of electronic evidence. Recognition means:

- The MEP is admissible under the jurisdiction's existing electronic evidence framework (UU ITE, Evidence Act §106B, Ley 527, etc.) without requiring new legislation.
- The MEP's cryptographic integrity is accepted as the default, absent specific rebuttal.
- The MEP's timestamp is accepted as *prima facie* evidence of the fact of existence on the given slot.

Recognition does not mean:

- The MEP grants statutory rights (only WIPO and national registries do).
- The MEP is a substitute for registered trademarks or patents.
- The creator is relieved of the burden of proving ownership or distinctiveness.

### 7.2 Minimum recognition checklist

An MEP qualifies for recognition if:

1. The `mep_version` is a version published by the WIPO CWS Blockchain Task Force or a body designated by it.
2. The `package_hash` matches the SHA-256 of the on-Arweave document (minus the `package_hash` field itself).
3. The `protocol_signature` verifies against the `protocol_authority` public key, and that public key is on the published registry of authorised protocols.
4. The anchoring blockchain transaction is finalised and retrievable at the stated explorer URL.
5. The content at the `metadata_uri` is retrievable and its hash matches `content_hash`.

If any of these fails, the MEP is NOT recognised. If all pass, the MEP is accepted as supplementary electronic evidence of the facts it asserts about creation, licensing, royalty distribution, and (if included) dispute history.

### 7.3 Jurisdiction-specific mapping

**Indonesia** — UU ITE Pasal 5 admits electronic evidence. Putusan MK No. 20/PUU-XIV/2016 bedrock precedent on digital records. DJKI is asked to publish a Surat Edaran stating that MEPs meeting the §7.2 checklist are admitted as supplementary evidence before the Commercial Court.

**Kenya** — Evidence Act §106B admits electronic records with §53 certification. KIPI is asked to add MEP verification to its examiner training and to recognise the Section 53 certificate template bundled with every Kenya-jurisdiction MEP.

**Colombia** — Ley 527 Artículos 5, 11, and 12 provide the strongest blockchain-friendly electronic commerce framework in Latin America. SIC, uniquely combining registration and enforcement, is the optimal pilot venue.

**WIPO Arbitration and Mediation Center** — the existing procedure permits parties to submit electronic evidence without precertification. Adding MEP to the Center's recommended evidence formats requires a Secretariat administrative update, not a treaty amendment.

---

## 8. Gap Analysis — Story Protocol vs the Jakarta Protocol

Story Protocol, launched in 2024 with USD 140M from a16z and Polychain, is the most visible blockchain-IP project and the benchmark any WIPO-facing proposal must address.

### 8.1 Architectural comparison

| Dimension | Story Protocol | Jakarta Protocol (Mycelium ref impl) |
|---|---|---|
| Chain model | Proprietary L1 (Cosmos SDK + EVM) | Chain-neutral spec; Solana reference impl |
| Token requirement | $IP token required for gas | None. USDC + fiat onramp |
| Financial model | IP tokenised as financial asset | IP as infrastructure with licensing + royalty primitives |
| Agent protocol | Custom "Agent TCP/IP" (ATCP/IP) | MCP + A2A + UCP (industry standards) |
| Agent ecosystem reach | Story ecosystem only | 97M+ MCP downloads, Google/Shopify/Walmart UCP |
| Enforcement | On-chain only; violation has no off-chain consequence | Court-ready evidence packages in 8 jurisdictions |
| Jurisdiction tailoring | None | Indonesia, Kenya, Colombia, WIPO, plus 4 planned |
| WIPO alignment | None announced | §5 Nice Class + §5 Berne Category + §7 Recognition Procedure |
| Global South pricing | Gas denominated in volatile $IP | USDC-denominated; 10% revenue → Access Fund |
| Traditional Knowledge module | None | Defined IP type with pilot-community governance roadmap |
| C2PA content provenance | None | Required bridge for AI-generated content |
| Open-source licence | Mixed — core proprietary | MIT across all reference implementation |
| Ecosystem funding mechanism | VC-dependent ($140M raised) | Protocol fees (0.5% of royalty distributions) + Access Fund |

### 8.2 Why Story's model is the wrong fit for WIPO

**Token gating is incompatible with public infrastructure.** WIPO member states cannot endorse a standard that requires creators or courts to hold a specific, volatile, VC-controlled asset to exercise rights. The Jakarta Protocol's §3.3 prohibition on protocol tokens is a *precondition* for WIPO alignment, not a stylistic choice.

**Custom agent protocols don't compose with the standards ecosystem.** The Model Context Protocol (Anthropic / Linux Foundation, 97M+ monthly SDK downloads by March 2026), Agent2Agent (Google / Linux Foundation, 50+ partners), and Universal Commerce Protocol (Google/Shopify/Visa/Mastercard, 60+ endorsers) are industry-standard. Story's ATCP/IP, launched December 2024, has no meaningful third-party adoption 16 months later. Building on standards is not optional for an infrastructure proposal to WIPO.

**Enforcement-free IP is theatre.** Registering IP on-chain with no path to off-chain enforcement is registration theatre. The Jakarta Protocol's §7 Recognition Procedure is the part that distinguishes a theoretical registry from operational infrastructure.

**No Traditional Knowledge module.** WIPO has had an Intergovernmental Committee on Traditional Knowledge since 2000 and concluded the 2024 Diplomatic Conference treaty on Genetic Resources and Associated Traditional Knowledge. A blockchain-IP protocol with no TK module is structurally unable to participate in the most important WIPO-normative development in 25 years. The Jakarta Protocol §5's `TraditionalKnowledge` IP type is the minimum baseline.

**No Global South pricing.** Story Protocol gas is denominated in $IP, making it more expensive for poor creators than for rich ones in real terms (both pay the same token, but the poor creator sacrifices a larger share of income). The Jakarta Protocol's USDC denomination and 10% Access Fund is the opposite: designed to subsidise the population WIPO member states in the Global South are chartered to serve.

### 8.3 Where Story is correct

To be balanced: Story is correct about three things.

- **On-chain IP infrastructure is needed.** The diagnosis is right. The response must be public-infrastructure-shaped, not VC-asset-shaped.
- **Programmable licences are the right primitive.** Machine-readable licence terms are the correct abstraction.
- **Agent-native IP is an inevitability.** AI agents will transact IP. The question is which standard they use.

The Jakarta Protocol takes the diagnosis and the primitives, discards the token and custom protocol, and delivers the result through a standards-aligned, court-aligned, WIPO-aligned specification.

---

## 9. Governance

### 9.1 Authority model

The `protocol_authority` signing key is, in production, a 3-of-5 Squads multisig. The five key holders are structured to prevent capture:

1. Mycelium Network Pte Ltd (Singapore) — protocol custodian
2. INFIA Group (Indonesia) — founding anchor partner
3. Independent ASEAN creator-coalition representative (rotating two-year term)
4. Independent Global South legal-scholar seat (rotating two-year term)
5. WIPO-designated observer seat (non-voting invite; voting if accepted)

No single entity, including Mycelium Network Pte Ltd, can unilaterally sign protocol actions. A formal governance charter is published at [jakarta-protocol.org/governance](https://jakarta-protocol.org/governance) and is under CC-BY 4.0.

### 9.2 Protocol changes

The MEP schema, Registration Profile, and Licensing Profile are versioned. v1.x changes are backward-compatible; v2+ changes require a 180-day public comment period, a formal RFC, and 4-of-5 multisig approval. No changes take effect in less than 60 days after approval.

### 9.3 Revocation

A `protocol_authority` can be revoked by 4-of-5 multisig action. Revocation invalidates no historical MEPs — they remain valid under the authority that signed them at the time — but the revoked authority cannot sign new MEPs.

### 9.4 Access Fund governance

The Global South Access Fund is a separate Singapore public company with its own board, statutorily required to disburse funds exclusively to World Bank LMIC and LIC jurisdictions. Annual independent audit. Published recipient list. Cannot be merged back into Mycelium Network operating revenue under any circumstance.

---

## 10. WIPO CWS Task 59 Interop Profile

WIPO CWS Task 59 (Blockchain) mandates a standard for blockchain use in IP ecosystems. The Jakarta Protocol offers the following explicit interop points:

| CWS Task 59 requirement | Jakarta Protocol response |
|---|---|
| Interoperability across IP offices | MEP schema is chain-neutral, JSON-canonical, Nice/Berne-tagged |
| Governance and regulation | §9 multisig + RFC process; explicit revocation procedure |
| Data integrity and non-repudiation | Ed25519 signatures + Arweave permanence + on-chain anchoring |
| Timestamp reliability | Solana PoH (chain reference) or equivalent deterministic ordering (spec) |
| Identity management | Ed25519 public keys, optionally bound to DID (did:web, did:key) |
| Scalability | Solana reference: 65,000 TPS demonstrated capacity; spec imposes no cap |
| Integration with existing IP procedures | §7 Recognition Procedure maps to existing evidence frameworks without treaty amendment |
| Privacy | Content off-chain; only hashes on-chain; perceptual hashes disclosed by creator choice |

The Jakarta Protocol is offered as an input to Task 59, not a competing deliverable. The schema, profile, and procedure are all placed under CC-BY 4.0 for free adoption or adaptation by CWS.

---

## 11. Compatibility with WIPO Classifications

| WIPO classification | Jakarta Protocol field | Encoding |
|---|---|---|
| Nice Classification (11th ed.) | `wipo_metadata.nice_class` | u8 (1-45) |
| Berne category | `wipo_metadata.berne_category` | u8 (1-9) |
| Locarno (industrial designs) | Extension | u16 (31 classes + subclasses) |
| Vienna (figurative trademarks) | Extension | string (5-level hierarchical code) |
| IPC (patents) | Out of scope for v1.0 |— |

Country codes follow ISO 3166-1 α2. Language codes for MEP documents follow BCP 47 (language-region), defaulting to `en-US` for WIPOArbitration, `id-ID` for Indonesia, `sw-KE` or `en-KE` for Kenya, `es-CO` for Colombia.

---

## 12. Reference Implementation — Mycelium Network

### 12.1 Architecture

Five Anchor programs on Solana implementing the Jakarta Protocol v1.0 profiles:

| Program | Purpose | Devnet address | Mainnet-beta address |
|---|---|---|---|
| `mycelium_spore` | §5 Registration Profile | `AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz` | `GQKhpugP3tECnV64WVQoBRQembMcaW35CDPpLzGTprrR` |
| `mycelium_hypha` | §6 Licensing Profile | `9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5` | `BWaYdvceTLCR4T2E67C4uNrxxDQH5fDMDtL4kqdMPjuV` |
| `mycelium_rhizome` | Royalty distribution (up to 8 recipients, platform-fee-bound) | `9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu` | `7nKmtUgSaZTgF5fMcjQw1LR8nfKG8kgLauqAmtC3qJWW` |
| `mycelium_meridian` | MEP generation + Ed25519-verified on-chain anchoring | `7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc` | `2PBZSAN2LSoGHWsWmr6kFBtrVHicTvTHiZBF8Y4B54Le` |
| `mycelium_drp` | 5-stage dispute resolution with staked mediator economy | `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` | `BKrUCdqyVLywaT3WhLcKkLZ4nEib3K9ZXA4bVd7xbifU` |

All programs are written in Rust using Anchor 0.30.1, compiled to SBPF, and deployed to Solana devnet. Mainnet-beta addresses are reserved but not yet deployed pending OtterSec audit (scheduled Q3 2026).

### 12.2 Why Solana for the reference

Four technical reasons Solana was chosen for the reference implementation:

1. **Proof of History** — IP law cares about *who created what, when*. PoH provides a native cryptographic timestamp from the slot leader itself. No other Layer 1 has this property.
2. **Finality latency** — 400ms current, ~150ms on Alpenglow. Registration feels interactive, not like a database job.
3. **Transaction cost** — USD 0.004 per registration at current market rates. The only Layer 1 whose economics allow million-creator-per-month volumes from LMIC countries.
4. **Mature SPL ecosystem** — USDC is native; Metaplex Core for NFT representation; Squads for multisig; Helius for indexing; all free or cost-plus pricing, no proprietary-chain tax.

None of these are normative. The spec is chain-neutral. They explain *why* the reference implementation is on Solana, not why others must be.

### 12.3 Security posture

- All mainnet deployments guarded by Squads 3-of-5 multisig upgrade authority.
- OtterSec audit scheduled Q3 2026 prior to mainnet activation.
- Immunefi bug bounty live on mainnet day one.
- Meridian `generate_mep` parses the Ed25519 verification instruction data and rejects any mismatch between the signed message and the stored `package_hash` — a presence-only check is explicitly insufficient. See `programs/mycelium-meridian/src/lib.rs` lines 72–140.
- Rhizome `distribute_royalties` constrains `platform_wallet` to the address bound at `configure_royalty` time, preventing attacker-supplied drain-to-arbitrary-wallet transactions.
- Spore uses a `content_hash_registry` PDA for global duplicate-content rejection — a third party cannot re-register someone else's work under a new PDA.

### 12.4 Off-chain components

- **Similarity Oracle** (Python) — dual-layer: perceptual hashing (pHash, Chromaprint, SimHash) → deep embedding (OpenCLIP ViT-B/32, DINOv2 ViT-B/14, CLAP, multilingual-e5-large) → Qdrant vector DB (3 collections, HNSW index). Deployable on a single T4 GPU; ~USD 2–5/day at 1K registrations/day.
- **Evidence Engine** (TypeScript / Cloudflare Workers) — W3C PROV formatter + jurisdiction-specific PDF generator via Puppeteer.
- **IP Graph Indexer** — Helius webhooks + PostgreSQL; exposes GraphQL for derivative and licence chains.
- **Platform Connectors** — YouTube Content ID, Meta Rights Manager, TikTok IP Portal, Shopee, Tokopedia, AliExpress. Unified takedown API.
- **MCP Server** — 11 tools, 4 resources, stdio + Streamable HTTP transports. Exposes full protocol to any MCP-compatible AI agent.
- **A2A Agent Card** — Published at `/.well-known/agent-card.json`. Six skills exposed for agent-to-agent discovery and delegation.
- **UCP Manifest** — Published at `/.well-known/ucp`. IP licences exposed as commerce products with USDC checkout.

All components open-sourced MIT at [github.com/infia-group/mycelium-network](https://github.com/infia-group/mycelium-network).

---

## 13. Indonesia Pilot Proposal

### 13.1 Scope

A 12-month pilot in partnership with:

- **DJKI** (Direktorat Jenderal Kekayaan Intelektual) as sponsoring IP office
- **INFIA Group** as anchor creator-partner (24M+ Dagelan audience, 36+ IPs including Tahilalats, Hai Dudu, Mindblowon Studio)
- **Indonesia New Media Forum (INMF)** as 38-creator coalition stress-test cohort
- **Omni Legal / DJKI-trained counsel** for legal integration and judge training
- **Universitas Indonesia Faculty of Law** as independent academic observer

### 13.2 Deliverables

| Month | Deliverable |
|---|---|
| 1–3 | DJKI Surat Edaran draft on MEP admissibility under UU ITE |
| 2–6 | 10,000 INFIA IP assets registered on Mycelium mainnet |
| 4 | First Commercial Court submission using an MEP as supplementary evidence |
| 6 | 10 Indonesian IP law firms trained in MEP verification procedure |
| 9 | Judicial training module delivered to Commercial Court judges, 5 cities |
| 12 | Independent UI academic evaluation of pilot outcomes |

### 13.3 Budget

Total Indonesia pilot budget: USD 38,000–69,000 over 18 months, fully funded by INFIA Group / Mycelium Network. No WIPO or DJKI monetary contribution requested. The ask is *procedural recognition* and pilot cooperation, not funding.

### 13.4 Success criteria

- At least one Commercial Court judgment referring to an MEP (regardless of whether the judgment turned on the MEP or on other evidence).
- At least 5,000 registrations by creators earning under USD 500/month, demonstrating real Global South access.
- Zero successful attacks on the cryptographic integrity of any MEP.
- Formal DJKI publication recognising MEPs as supplementary evidence by month 12.

### 13.5 Why Indonesia first

1. Home-market advantage for Mycelium Network's anchor partner (INFIA Group).
2. UU ITE Pasal 5 and Putusan MK 20/PUU-XIV/2016 provide the strongest electronic-evidence precedent in ASEAN.
3. DJKI's "Bankable IP" initiative and digitisation roadmap are already aligned with programmable-IP primitives.
4. ASEAN Economic Community integration (670M people) makes Indonesian recognition a platform for regional adoption.
5. World IP Day 2026 in Jakarta and the October WIPO session provide natural announcement windows.

---

## 14. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Judge unfamiliarity with blockchain | High | Medium | Judicial training module; plain-language verification; bundle expert-witness declaration |
| Political optics of "crypto" framing | High | High | Explicit no-token posture; USDC denomination; position as evidence layer |
| Solana chain outage during pilot | Low | High | Mainnet-beta SLA; MEP retrievability relies on Arweave (separate failure domain) |
| WIPO CWS delay in Task 59 finalisation | High | Low | Protocol advances unilaterally; CWS alignment is welcome but not a dependency |
| Competing standard emerges | Medium | Medium | Spec is CC-BY 4.0; early adoption window; INFIA Group anchor user compounds moat |
| Private key compromise | Low | High | 3-of-5 multisig; HSM custody; §9.3 revocation procedure |
| Story Protocol counter-proposal to WIPO | Medium | Medium | Story's token-gated model is structurally incompatible with WIPO member-state endorsement; §8 analysis pre-empts |
| DJKI institutional resistance | Medium | High | INFIA Group existing DJKI relationships; Bankable IP initiative already aligned; pilot is opt-in |
| Cost of Arweave permanence rising | Low | Medium | Protocol permits equivalent permanent storage (Filecoin, IPFS with pinning SLA) in v1.1 |
| AI-generated content flood | High | Low | AI-generated IP type explicitly permitted; C2PA bridge required for provenance |

---

## 15. Roadmap

| Quarter | Milestone |
|---|---|
| Q2 2026 | Jakarta Protocol v1.0 submission to WIPO CWS (this document) |
| Q3 2026 | OtterSec audit of Mycelium reference implementation; mainnet-beta activation |
| Q4 2026 | Jakarta WIPO Regional Session presentation (October); DJKI pilot launch |
| Q1 2027 | First Indonesian Commercial Court MEP submission |
| Q2 2027 | Kenya pilot (KIPI + Kenyan law firms) |
| Q3 2027 | Colombia pilot (SIC + Ley 527 mapping) |
| Q4 2027 | WIPO CWS formal input on Task 59 (if Task 59 still open) |
| 2028 | ASEAN IP Working Group regional profile |
| 2028+ | ARIPO and Andean Community regional profiles |

---

## 16. Ask

Three specific requests to the WIPO CWS Blockchain Task Force meeting in Jakarta, October 2026:

1. **Accept this document as an input to Task 59.** Place the MEP schema, Registration Profile, and Licensing Profile into the Task Force working corpus for evaluation.

2. **Endorse a DJKI pilot.** WIPO's administrative endorsement of a DJKI-run pilot — with Mycelium Network as reference implementation — would signal to ASEAN states that on-chain supplementary evidence is procedurally acceptable under existing member-state electronic-evidence frameworks.

3. **Convene a Global South Working Group.** Under WIPO auspices, convene Indonesia, Kenya, Colombia, and two Andean/African peer states to jointly refine the §7 Recognition Procedure. This is the pathway to a regional standard that member states can adopt without treaty amendment.

None of these requests require a funding commitment from WIPO. All are procedural.

---

## 17. Appendices (separate files)

- [01_Story_Protocol_Gap_Analysis.md](./01_Story_Protocol_Gap_Analysis.md) — 12-dimension detailed comparison
- [02_MEP_Sample_Document.json](./02_MEP_Sample_Document.json) — fully populated reference MEP
- [03_WIPO_CWS_Task59_Compatibility_Matrix.md](./03_WIPO_CWS_Task59_Compatibility_Matrix.md) — explicit mapping to Task 59 requirements
- [04_DJKI_Executive_Brief.md](./04_DJKI_Executive_Brief.md) — 2-page Bahasa Indonesia executive summary for DJKI leadership
- [05_Technical_Appendix.md](./05_Technical_Appendix.md) — Ed25519 verification procedure, duplicate rejection rule, and full account schema

---

## 18. Contact

**Aji Pratomo** — Founder, INFIA Group / Mycelium Network
Jakarta, Indonesia
Mycelium Network Pte Ltd — Singapore
Twitter/X: [@memejunkies](https://twitter.com/memejunkies)

This submission is placed under CC-BY 4.0. The reference implementation is MIT. Adapt, fork, improve — the Jakarta Protocol is a standard, not a product.

---

*The mycelium doesn't fight the forest. It IS the forest's infrastructure.*
*WIPO is the canopy. The Jakarta Protocol is the mycelium underneath.*

---

**END OF MAIN SUBMISSION — continue to appendices**
