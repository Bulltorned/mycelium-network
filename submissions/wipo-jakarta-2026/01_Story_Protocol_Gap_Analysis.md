# Appendix 01 — Story Protocol vs Jakarta Protocol: 12-Dimension Gap Analysis

*Companion to the Jakarta Protocol WIPO Submission, October 2026*

---

## Purpose

Story Protocol is the best-funded and most visible blockchain-IP project in the market. Any WIPO-facing proposal will be asked, explicitly or implicitly: *how is this different from Story?* This appendix answers that across twelve technical and policy dimensions — balanced where Story is correct, direct where it is structurally unsuited to a WIPO-endorsed standard.

This is not a marketing document. It is a technical comparison for standards-body evaluators.

---

## Executive Verdict

Story Protocol is a venture-funded L1 that tokenises IP as a financial asset for institutional investors and IP licensing platforms. It works for what it was designed for.

The Jakarta Protocol is public-infrastructure-shaped: chain-neutral, token-free, court-aligned, WIPO-classification-compatible, Global-South-subsidised. It is designed for what Story cannot be: a specification a WIPO member state can endorse without granting monopoly or market advantage to any private chain or token holder.

**The two can coexist.** An IP asset could, in principle, be registered on both. The Jakarta Protocol's chain-neutrality is a feature — it does not preclude creators from also using Story's financialisation primitives if they choose. What it does preclude is WIPO endorsement of a single token-gated system.

---

## Dimension 1 — Chain Model

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Execution layer | Story L1 (Cosmos SDK + EVM) | Chain-neutral specification |
| Reference impl | N/A (Story only) | Solana 0.30.1 Anchor programs |
| Lock-in profile | Complete — all licences, royalties, provenance on Story L1 | None — any chain meeting §4.4 can emit valid MEPs |
| Mainnet launch | February 2025 | Scheduled Q3 2026 (post-OtterSec audit) |

**Analysis.** Story requires creators, licensees, courts, and platforms to interact with Story L1 specifically. A WIPO-endorsed standard cannot require member states or their citizens to interact with a single private chain. The Jakarta Protocol's chain-neutrality is the minimum requirement for standards-body acceptability. Solana reference is a recommendation, not a mandate.

## Dimension 2 — Token Requirement

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Native token | $IP (launched Feb 2025) | None |
| Gas denomination | $IP | SOL (ref impl); protocol-native gas (spec) |
| Payment denomination | $IP + USDC | USDC + fiat onramp via Circle |
| Creator cost exposure | Holds $IP volatility | Zero token exposure |

**Analysis.** A standard that requires holding a volatile VC-controlled asset to use it is structurally incompatible with public infrastructure. WIPO member states cannot, without political controversy, endorse a standard that enriches $IP holders by mandating its use. Jakarta §3.3 prohibits protocol tokens in any future version of the spec. This is a permanent design constraint, not an initial simplification.

## Dimension 3 — Financial Model

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| IP treatment | Financial asset to be tokenised and speculated | Infrastructure primitive to be registered, licensed, enforced |
| Target user | Institutional IP investors, rights-holder funds | Individual creators, AI agents, courts |
| Revenue model | Token appreciation + protocol fees in $IP | Protocol fees in USDC + 10% Access Fund |
| VC backing | Andreessen Horowitz, Polychain — $140M raised | Zero VC; funded by INFIA Group ops revenue |
| Exit pressure | Token listing, secondary trading, institutional adoption | None — no token to list |

**Analysis.** VC funding of USD 140M implies USD 1B+ expected exit. That exit requires token appreciation, institutional adoption, and ecosystem capture. These incentives conflict with public-infrastructure values. The Jakarta Protocol has no exit pressure because it has nothing to exit.

## Dimension 4 — Agent Protocol

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Protocol name | Agent TCP/IP (ATCP/IP) | MCP + A2A + UCP |
| Launch date | December 2024 | Uses industry standards (March 2024 onward) |
| Third-party adoption | Minimal — ecosystem partners only | 97M+ MCP downloads; 50+ A2A partners; 60+ UCP endorsers |
| Governance | Story Foundation | Linux Foundation (MCP, A2A); Google/Shopify/Visa/MC consortium (UCP) |
| Agent compatibility | Requires ATCP/IP implementation | Any MCP, A2A, or UCP-compliant agent |

**Analysis.** The original TCP/IP won because it was free, open, required no permission, and was adopted by the organisations that already controlled the network (ARPANET operators, universities). Story's ATCP/IP does not satisfy any of these conditions. It's a proprietary protocol with the naming heritage of an open one. The Jakarta Protocol uses the open agent protocols that actually have adoption — this is table stakes for any agent-facing standard in 2026.

## Dimension 5 — Enforcement

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| On-chain enforcement | Programmable licences with on-chain verification | Same |
| Off-chain enforcement | Not specified — "user's responsibility" | §7 Recognition Procedure + MEP + jurisdiction adapters |
| Court admissibility | Not designed for | Designed for UU ITE, Evidence Act §106B, Ley 527, WIPO Arbitration |
| Platform takedown integration | None announced | YouTube Content ID, Meta, TikTok, Shopee, Tokopedia connectors |
| Similarity detection | None announced | Dual-layer oracle: pHash + CLIP/DINOv2 + Qdrant |

**Analysis.** IP infrastructure with no path to enforcement is registration theatre. A creator who cannot enforce a right effectively does not have it. The Jakarta Protocol treats enforcement — court-ready evidence, platform takedown, similarity detection — as first-class features, not afterthoughts.

## Dimension 6 — WIPO Alignment

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| WIPO CWS engagement | Not publicly announced | §10 explicit Task 59 interop profile |
| Nice Classification fields | Not in IPAsset schema | `wipo_metadata.nice_class` in Spore program |
| Berne category fields | Not in IPAsset schema | `wipo_metadata.berne_category` in Spore program |
| Madrid Protocol complementarity | Not addressed | §3.1 "completes, does not compete" principle |
| DJKI / IP office partnership | Not announced | 12-month Indonesian pilot with DJKI proposed |

**Analysis.** Jakarta Protocol was designed from inception to be WIPO-compatible. Story Protocol was designed from inception to be a VC-scale L1 business. The metadata schemas reflect the difference: one includes WIPO classifications, the other does not.

## Dimension 7 — Global South Access

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Registration cost | Gas in $IP (volatile; currently ~$0.50–2 per tx on Story L1) | SOL (~$0.004 per tx on Solana) |
| Subsidy mechanism | None announced | 10% of revenue → Global South Access Fund (§9.4) |
| Fiat onramp for non-crypto creators | Via third parties | Native via Circle USDC onramp |
| Targeted jurisdictions | Global North institutional | Indonesia, Kenya, Colombia, ASEAN, ARIPO, CAN |
| Creator earning <$500/month viable | Practically no | Yes — $0.004 is 0.001% of monthly income |

**Analysis.** The Jakarta Protocol's access economics are engineered for the 3.2 billion people in LMIC/LIC jurisdictions. Story's are engineered for the institutional IP investor class. These are different markets — they are not a fight. But WIPO member states in the Global South cannot endorse a standard whose economics exclude their own citizens.

## Dimension 8 — Traditional Knowledge

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| IP type for TK | Not distinguished | `IPType::TraditionalKnowledge` enum variant |
| TK-specific governance | None announced | Pilot-community governance roadmap §5 |
| WIPO IGC-TK alignment | Not addressed | Direct — tracks 2024 Diplomatic Conference TK treaty |
| Community consent mechanism | N/A | Required for TK registration (planned v1.1) |

**Analysis.** WIPO concluded the Diplomatic Conference treaty on Genetic Resources and Associated Traditional Knowledge in 2024. Any blockchain-IP standard that does not accommodate TK is structurally unable to participate in what may be the most important WIPO normative development of the 2020s. The Jakarta Protocol treats TK as a first-class IP type with explicit community-governance requirements.

## Dimension 9 — AI Training Provenance

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Machine-readable AI training flag | Partial — available in licence terms | MANDATORY — `ai_training_allowed` bool on every licence template |
| C2PA provenance bridge | Not announced | Required for AI-generated IP type |
| AI agent verification path | Via ATCP/IP | Via MCP `check_license` tool (any MCP agent) |
| Dataset licensing primitive | Not distinguished | `IPType::Dataset` enum variant |

**Analysis.** The Jakarta Protocol's mandatory AI training flag is the minimum machine-readable answer an AI agent must be able to obtain to operate under the protocol. C2PA bridging for AI-generated content aligns with the Adobe/Microsoft/BBC/Intel coalition's content authenticity standard, which is emerging as the de facto regulatory expectation for AI-generated media labelling.

## Dimension 10 — Open Source

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Core protocol licence | Mixed — some proprietary | MIT across reference implementation |
| Specification licence | Not a specification | CC-BY 4.0 |
| Fork permissibility | Subject to token economics | Unrestricted |
| Implementation competition | Single implementer | Any entity can produce a compliant implementation |

**Analysis.** A standard body cannot endorse a specification over which a single entity holds proprietary rights. The Jakarta Protocol's CC-BY 4.0 specification + MIT reference implementation is the minimum-acceptable licensing posture for WIPO engagement.

## Dimension 11 — Dispute Resolution

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| On-chain dispute program | Not prominent | `mycelium_drp` — 5-stage escalation |
| Mediator economy | None | Staked mediators, min 1,000 USDC, reputation-scored |
| Arbitration integration | None | Stage 4: 3-person binding panel |
| Cross-jurisdictional path | None | Stage 5: evidence export to local legal partners |
| Cost progression | Unclear | $0 → $0 → $50 → $200-500 → variable |

**Analysis.** Dispute resolution is where IP protection proves itself. The Jakarta Protocol's 5-stage escalation is modelled on the UDRP and WIPO Arbitration procedures, adapted for programmable execution. Stages 1–3 happen without human lawyers. Stage 4 mimics WIPO panel arbitration. Stage 5 hands off to national courts with a pre-formatted MEP. This is the infrastructure Story's "user's responsibility" phrase waves away.

## Dimension 12 — Governance

| | Story Protocol | Jakarta Protocol |
|---|---|---|
| Authority model | Story Foundation + token governance | §9 — 3-of-5 Squads multisig; 5 declared seats |
| Voting mechanism | Token-weighted | Multisig with declared composition |
| Change procedure | Foundation + token vote | Versioned spec; 180-day RFC; 4-of-5 for v2+ |
| Capture resistance | Token concentration risk | §9 — no single entity can sign alone; WIPO observer seat |
| Transparency | Foundation-controlled | CC-BY 4.0 published charter |

**Analysis.** Token-weighted governance of a public-infrastructure specification concentrates control in large token holders, typically VC funds. The Jakarta Protocol's declared-seat multisig with a WIPO observer seat is the maximum-transparency, minimum-capture structure compatible with operational decision-making.

---

## Summary Table

| Dimension | Story | Jakarta |
|---|:-:|:-:|
| 1. Chain-neutral | ✗ | ✓ |
| 2. Token-free | ✗ | ✓ |
| 3. Public-infrastructure financial model | ✗ | ✓ |
| 4. Industry-standard agent protocols | ✗ | ✓ |
| 5. Off-chain enforcement designed in | ✗ | ✓ |
| 6. WIPO classifications in schema | ✗ | ✓ |
| 7. Global South subsidy mechanism | ✗ | ✓ |
| 8. Traditional Knowledge first-class | ✗ | ✓ |
| 9. Mandatory AI training flag | ~ | ✓ |
| 10. CC-BY + MIT open | ~ | ✓ |
| 11. Formal dispute resolution | ~ | ✓ |
| 12. WIPO-observer governance | ✗ | ✓ |

**Score.** Story: 0 unambiguous yes, 3 partial, 9 no. Jakarta: 12 yes.

These are not equivalent technologies attempting the same thing. They target different users through different incentive structures. The Jakarta Protocol's twelve-yes posture is engineered for WIPO endorsement; Story's architecture is engineered for token appreciation. **Both can exist.** But only one can be proposed to WIPO as a standards-body-endorsable specification.

---

## Where Story is correct — and why that diagnosis matters

Three observations from Story Protocol's team that the Jakarta Protocol adopts:

1. **On-chain IP infrastructure is necessary.** The diagnosis is right. The question is whether the response is token-gated or public-infrastructure-shaped.
2. **Programmable licences are the right primitive.** Machine-readable, chain-enforced licence terms are correct. The Jakarta Protocol's Licensing Profile (§6) adopts this.
3. **AI agents will transact IP natively.** Correct — but they will do so over industry-standard protocols (MCP, A2A, UCP), not over custom ones.

Taking the correct diagnosis and delivering it through an open, token-free, WIPO-compatible, Global-South-accessible specification is what the Jakarta Protocol does. Story's diagnosis is correct. Story's architectural response is incompatible with WIPO endorsement. The Jakarta Protocol's architectural response is not.

---

*End of Appendix 01.*
