---
aliases: [Mycelium, Mycelium Protocol, Mycelium Network]
tags: [moc, ip, web3, solana, protocol, active]
entity: Mycelium-Network
type: protocol
parent: "[[Holdings/INFIA/_Index]]"
status: active
chain: solana-devnet
created: 2026-03-23
---

# Mycelium Network — Programmable IP on Solana

> INFIA's Programmable IP protocol on Solana. Instant, verifiable, court-admissible proof of IP creation for < $0.01. The anti-WIPO.

## Status
- **Phase:** active — devnet deployed, 4/4 programs built
- **Priority:** 🟡 active — strategic Web3 infrastructure play
- **Owner:** Aji Pratomo
- **Revenue:** not yet — pre-mainnet, revenue model defined (registration fees, evidence packages, dispute resolution, API access)

## Purpose (for Claude)
> Mycelium Network is INFIA's Programmable IP protocol on Solana — the tech layer that makes all of INFIA's IP (Tahilalats, Hai Dudu, Dagelan, etc.) registrable, licensable, and enforceable on-chain for under $0.01. It's the "anti-WIPO" play: court-ready evidence in 8 jurisdictions, no token, Global South first. Any question about on-chain IP registration, programmable licensing, Solana programs, MCP/A2A agent interoperability for IP, or INFIA's Web3 strategy beyond EPIK references Mycelium. Key sensitivity: NKK control gap (§3 legal triage) directly affects which IPs can be registered through Mycelium — Tahilalats TM ownership must be resolved first.

## Status: ACTIVE — Devnet Deployed

| Component | Status | Program ID |
|-----------|--------|------------|
| Spore (IP Registration) | ✅ Built | `7UkHLH3qUNxAn9ixVvDckUnqVmNJazppXcDGZ57JtXe` |
| Hypha (Licensing Engine) | ✅ Built | `9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5` |
| Rhizome (Royalty Splits) | ✅ Built | `9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu` |
| Meridian (Dispute Resolution) | ✅ Built | `7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc` |
| MCP Server (Agent Interface) | ✅ Written | 11 tools, 4 resources |
| A2A Agent Card | ✅ Written | 6 skills exposed |
| UCP Commerce Manifest | ✅ Written | License-as-commerce |
| Similarity Oracle | 🔲 Planned | pHash + CLIP + Qdrant |
| Evidence Engine | 🔲 Planned | 8 jurisdiction adapters |
| Web App | 🔲 Planned | Next.js 14 |

## Architecture — 5 Biological Layers

1. **Spore** — Registration & proof of existence (how mycelium reproduces)
2. **Hypha** — Licensing & rights management (threadlike connections)
3. **Network** — Discovery, search, similarity matching (connecting organisms)
4. **Decomposer** — Dispute resolution & enforcement (recycling dead matter)
5. **Canopy** — Governance & ecosystem (what the forest shows the world)

## Key Design Decisions

- **No token.** No $MYCO. Revenue from registration fees, evidence packages, dispute resolution, API access
- **Solana** for Proof of History (native cryptographic timestamps — IP is WHO/WHAT/WHEN)
- **Standard protocols** (MCP + A2A + UCP) not custom Agent TCP/IP like Story Protocol
- **Court-ready evidence** in 8 jurisdictions (Indonesia, Kenya, Colombia, China, US, UK, EU, France)
- **Global South first** — 10% of all revenue → Access Fund for LDC creators

## Key Documents

- [[Business-Units/Mycelium Network/CLAUDE.md|CLAUDE.md — Full Engineering Context]]
- [[Business-Units/Mycelium Network/docs/whitepaper.md|Protocol Whitepaper]]
- [[Business-Units/Mycelium Network/README.md|README]]

## Repository

- **GitHub:** https://github.com/gamalielaji/mycelium-network (private)
- **Branch:** master
- **Programs:** `programs/mycelium-spore/`, `mycelium-hypha/`, `mycelium-rhizome/`, `mycelium-meridian/`
- **MCP Server:** `mcp-server/src/index.ts`
- **Tests:** `tests/mycelium-spore.ts`, `mycelium-hypha.ts`, `mycelium-rhizome.ts`

## Competitive Position

| vs Story Protocol ($140M raised) | Mycelium Advantage |
|---|---|
| Custom protocol (ATCP/IP) | Standard MCP + A2A + UCP (97M+ agents) |
| Must hold volatile $IP token | USDC + fiat onramp (zero crypto) |
| On-chain enforcement only | Court-ready evidence in 8 jurisdictions |
| No Global South design | Subsidized registration for LDC creators |
| Co-founder stepped back Aug 2025 | Active development, founder-led |

## Revenue Model (No Token)

| Source | Year 2 Est. | Year 5 Est. |
|---|---|---|
| IP registration (SOL rent) | $40K | $200K |
| Evidence packages (USDC) | $50K | $500K |
| Dispute resolution (USDC) | $175K | $2.5M |
| API access (enterprise) | $60K | $600K |
| Platform connector fees | $20K | $1.2M |
| **Total** | **~$345K** | **~$5M** |

## Legal Integration — 3 Priority Jurisdictions

1. **Indonesia** (home market + ASEAN gateway) — UU ITE Pasal 5, DJKI pilot target
2. **Colombia** (CAN gateway to 4 Andean countries) — Ley 527, SIC pilot target
3. **Kenya** (ARIPO gateway to 22 African countries) — Evidence Act Section 106B

## Next Steps

- [ ] Deploy all 4 programs to Solana devnet (3/4 done, Spore pending SOL)
- [ ] Build minimal web app (connect wallet → register IP → view proof)
- [ ] Generate first real evidence package for Indonesian Commercial Court
- [ ] Take evidence package to IP law firm for validation
- [ ] OtterSec security audit pre-mainnet

## Related

- [[_Home]] — Back to HQ
- [[Holdings/INFIA/_Index]] — Parent entity
- [[Business-Units/EPIK/_Index]] — IP investment vehicle (potential synergy)
- [[Holdings/Global IP Company/_Index]] — Global IP benchmarks
- [[Business-Units/Mindblowon Studio/_Index]] — IP source (Tahilalats, Hai Dudu)
- [[Business-Units/IP-Partnerships/_Index]] — Licensing deal pipeline
- [[Holdings/Infia Network State/_Index]] — Network state thesis alignment

## Claude Notes
> - Mycelium is architecturally complete (4 Solana programs) but blocked on mainnet by: (1) SOL funding for Spore deployment, (2) OtterSec audit not yet started, (3) no web app yet for non-technical users.
> - The MCP server + A2A agent card make this uniquely positioned for agent-to-agent IP transactions — a moat Story Protocol doesn't have.
> - Legal dependency: Tahilalats trademark registration (who owns it — Palik or IMS?) must be resolved before registering any Tahilalats IP through Mycelium. Same applies to any IP where chain-of-title is unclear. **Update (Mar 26):** NKK resolution expected within ~2 weeks — waiting for Lik Palik's return.
> - Revenue model is conservative and token-free — good for institutional pitch but needs proof of demand. First evidence package validated by an IP law firm would be the unlock.
> - Strategic overlap with EPIK (investment arm) and Global IP Company (benchmarks) — Mycelium could be the infrastructure layer both plug into.
