import Link from "next/link";

const PROGRAMS = [
  { name: "Spore", role: "IP Registration", id: "AZGNVbxsnUmCi9CoEDrosJXnTK6xmujbutJsLTqXQyPz" },
  { name: "Hypha", role: "Programmable Licensing", id: "9tB3hfhMfHxr6cPjikpPn8y9zVvXLFzEX7NDHAWYodj5" },
  { name: "Rhizome", role: "Royalty Distribution", id: "9HRqJ3toCnSBB3JQiMdCmoLg6qW5a6PdpwdHypRVBLNu" },
  { name: "Meridian", role: "Evidence Anchoring", id: "7LrekmiYZDKPBsaSBVaXUVG9iXtB164XQ5ntRVeiMnfc" },
  { name: "DRP", role: "Dispute Resolution", id: "Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" },
];

const COMPARISON = [
  ["Chain-neutral specification", false, true],
  ["Token-free (no required volatile asset)", false, true],
  ["Agent protocols (MCP + A2A + UCP)", false, true],
  ["Court-ready evidence in 8 jurisdictions", false, true],
  ["Mandatory machine-readable AI training flag", "partial", true],
  ["WIPO Nice Classification in schema", false, true],
  ["Traditional Knowledge as first-class IP type", false, true],
  ["Global South Access Fund (10% revenue)", false, true],
  ["CC-BY 4.0 spec + MIT reference", "partial", true],
  ["WIPO-observer governance seat", false, true],
];

const SUBMISSION_DOCS = [
  { num: "00", title: "Jakarta Protocol Submission", desc: "Main proposal — 18 sections, MEP schema v1.0, 12-dim Story analysis, Indonesia pilot.", len: "45 min read", href: "/docs/00_Jakarta_Protocol_Submission" },
  { num: "01", title: "Story Protocol Gap Analysis", desc: "12-dimension technical comparison across standards-body dimensions.", len: "20 min read", href: "/docs/01_Story_Protocol_Gap_Analysis" },
  { num: "02", title: "MEP Sample Document (JSON)", desc: "Fully populated Mycelium Evidence Package — Tahilalats case.", len: "10 min read", href: "/docs/02_MEP_Sample_Document" },
  { num: "03", title: "WIPO CWS Task 59 Matrix", desc: "14 concerns × Jakarta Protocol architectural responses.", len: "25 min read", href: "/docs/03_WIPO_CWS_Task59_Compatibility_Matrix" },
  { num: "04", title: "DJKI Executive Brief", desc: "Ringkasan eksekutif dalam Bahasa Indonesia untuk DJKI.", len: "15 min read · id-ID", href: "/docs/04_DJKI_Executive_Brief" },
  { num: "05", title: "Technical Appendix", desc: "Cryptographic spec, Ed25519 strict-mode verify, canonical JSON, account schemas.", len: "30 min read", href: "/docs/05_Technical_Appendix" },
];

export default function Home() {
  return (
    <div>
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="border-b border-border">
        <div className="container-xl pt-20 pb-24">
          <div className="max-w-4xl">
            <div className="flex items-center gap-3 mb-8">
              <span className="eyebrow">Submission to WIPO CWS Blockchain Task Force</span>
              <span className="h-px w-8 bg-border-strong"></span>
              <span className="font-mono text-[11px] text-gold uppercase tracking-widest">
                Jakarta · October 2026
              </span>
            </div>

            <h1 className="font-serif text-display-xl font-semibold mb-8 leading-[1.02]">
              The on-chain evidence layer that{" "}
              <span className="italic text-accent">completes</span> WIPO —
              not competes with it.
            </h1>

            <p className="text-[19px] text-text-dim leading-[1.55] max-w-3xl mb-10">
              The <span className="text-text">Jakarta Protocol</span> is a
              chain-neutral, token-free specification for on-chain intellectual
              property evidence. Reference implementation deployed on Solana —
              five programs, $0.004 per registration, 400&nbsp;ms finality,
              court-verifiable by a judge with a web browser in 12 minutes.
            </p>

            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/docs/00_Jakarta_Protocol_Submission"
                className="inline-flex items-center gap-2 px-5 h-11 bg-text text-bg rounded-sm text-[14px] font-medium hover:bg-text-dim transition-colors"
              >
                Read the submission <span aria-hidden>→</span>
              </Link>
              <Link
                href="/registry"
                className="inline-flex items-center gap-2 px-5 h-11 border border-border-strong text-text rounded-sm text-[14px] font-medium hover:border-text-muted transition-colors"
              >
                Live registry
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-5 h-11 text-[14px] text-text-dim hover:text-text transition-colors"
              >
                Try the reference implementation
              </Link>
            </div>
          </div>

          {/* Data strip */}
          <div className="mt-20 grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border rounded-sm overflow-hidden">
            {[
              { k: "Cost / registration", v: "$0.004", sub: "Solana mainnet-beta" },
              { k: "Finality latency", v: "400ms", sub: "Proof of History" },
              { k: "Anchor programs", v: "5", sub: "Spore · Hypha · Rhizome · Meridian · DRP" },
              { k: "Jurisdiction adapters", v: "4 live · 4 planned", sub: "ID · KE · CO · WIPO" },
              { k: "Spec licence", v: "CC-BY 4.0", sub: "MIT reference implementation" },
            ].map((s) => (
              <div key={s.k} className="bg-bg p-5">
                <div className="eyebrow mb-3">{s.k}</div>
                <div className="font-serif text-[26px] font-semibold leading-none text-text">
                  {s.v}
                </div>
                <div className="text-[11px] text-text-muted mt-2 font-mono">
                  {s.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ THE ASKS ═══════════════ */}
      <section className="border-b border-border">
        <div className="container-xl py-20">
          <div className="max-w-2xl mb-12">
            <div className="eyebrow mb-5">Three procedural asks</div>
            <h2 className="font-serif text-display-lg font-semibold mb-5">
              None require funding. All are procedural.
            </h2>
            <p className="text-text-dim text-[15px] leading-relaxed">
              The Jakarta Protocol is self-funded and deployable today. What it
              asks from standards bodies is recognition, not resources.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-border border border-border">
            {[
              {
                num: "01",
                who: "WIPO CWS Task 59",
                ask: "Accept the MEP schema, Registration Profile, and Licensing Profile as inputs to the Blockchain Task Force working corpus.",
              },
              {
                num: "02",
                who: "DJKI Indonesia",
                ask: "Pilot MEP as supplementary electronic evidence in one Pengadilan Niaga case in 2027, under UU ITE Pasal 5.",
              },
              {
                num: "03",
                who: "ASEAN IP Working Group",
                ask: "Adopt the MEP schema as a regional interoperability baseline — no treaty amendment required.",
              },
            ].map((a) => (
              <div key={a.num} className="bg-bg p-8">
                <div className="flex items-baseline justify-between mb-5">
                  <span className="font-serif text-[44px] font-semibold text-accent-dim leading-none">
                    {a.num}
                  </span>
                  <span className="font-mono text-[11px] text-text-muted uppercase">
                    Procedural
                  </span>
                </div>
                <div className="font-serif text-[18px] font-semibold mb-3">
                  {a.who}
                </div>
                <p className="text-text-dim text-[13.5px] leading-relaxed">
                  {a.ask}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SUBMISSION DOCS ═══════════════ */}
      <section className="border-b border-border">
        <div className="container-xl py-20">
          <div className="grid md:grid-cols-12 gap-12 mb-10">
            <div className="md:col-span-4">
              <div className="eyebrow mb-5">Submission package</div>
              <h2 className="font-serif text-display-lg font-semibold mb-5">
                Seven documents. Read cold.
              </h2>
              <p className="text-text-dim text-[14px] leading-relaxed">
                The full package is designed for independent evaluation — a
                WIPO examiner, a DJKI lawyer, or an ASEAN trade officer can
                read any document without prior context.
              </p>
            </div>

            <div className="md:col-span-8">
              <div className="divide-y divide-border border border-border rounded-sm">
                {SUBMISSION_DOCS.map((d) => (
                  <Link
                    key={d.num}
                    href={d.href}
                    className="block p-5 hover:bg-bg-elevated/60 transition-colors group"
                  >
                    <div className="flex items-start gap-5">
                      <div className="font-mono text-[11px] text-text-muted pt-1 min-w-[28px]">
                        {d.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-4 mb-1">
                          <h3 className="font-serif text-[16.5px] font-semibold group-hover:text-accent transition-colors">
                            {d.title}
                          </h3>
                          <span className="font-mono text-[10.5px] text-text-muted whitespace-nowrap">
                            {d.len}
                          </span>
                        </div>
                        <p className="text-[13px] text-text-dim leading-relaxed">
                          {d.desc}
                        </p>
                      </div>
                      <span className="text-text-muted group-hover:text-accent transition-colors pt-1.5" aria-hidden>
                        →
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ LIVE ON SOLANA ═══════════════ */}
      <section className="border-b border-border">
        <div className="container-xl py-20">
          <div className="max-w-2xl mb-12">
            <div className="eyebrow mb-5">Reference implementation</div>
            <h2 className="font-serif text-display-lg font-semibold mb-5">
              Five programs. Deployed. Verifiable.
            </h2>
            <p className="text-text-dim text-[15px] leading-relaxed">
              The Jakarta Protocol specification is chain-neutral. The
              reference implementation is on Solana because PoH gives
              cryptographic timestamps natively, finality is sub-second, and
              cost is $0.004 per registration — the only Layer 1 whose
              economics match Global South creator incomes.
            </p>
          </div>

          <div className="border border-border rounded-sm overflow-hidden">
            <div className="grid grid-cols-12 px-5 py-3 border-b border-border bg-bg-elevated/50 text-[11px] font-mono uppercase tracking-widest text-text-muted">
              <div className="col-span-2">Program</div>
              <div className="col-span-4">Role</div>
              <div className="col-span-5">Devnet address</div>
              <div className="col-span-1 text-right">Status</div>
            </div>
            {PROGRAMS.map((p) => (
              <a
                key={p.name}
                href={`https://explorer.solana.com/address/${p.id}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-12 px-5 py-4 border-b border-border last:border-b-0 hover:bg-bg-elevated/40 transition-colors items-center"
              >
                <div className="col-span-2 font-serif text-[15px] font-semibold">
                  {p.name}
                </div>
                <div className="col-span-4 text-[13px] text-text-dim">
                  {p.role}
                </div>
                <div className="col-span-5 font-mono text-[11.5px] text-text-muted truncate">
                  {p.id}
                </div>
                <div className="col-span-1 text-right">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-accent uppercase">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent"></span>
                    Live
                  </span>
                </div>
              </a>
            ))}
          </div>

          <div className="mt-5 flex items-start gap-2 text-[12px] text-text-muted">
            <span className="font-mono">↗</span>
            <span>
              Mainnet-beta addresses reserved. Deployment pending OtterSec
              audit (Q3 2026). All programs guarded by 3-of-5 Squads multisig.
            </span>
          </div>
        </div>
      </section>

      {/* ═══════════════ COMPARISON MATRIX ═══════════════ */}
      <section className="border-b border-border">
        <div className="container-xl py-20">
          <div className="grid md:grid-cols-12 gap-12 mb-10">
            <div className="md:col-span-5">
              <div className="eyebrow mb-5">Standards-body alignment</div>
              <h2 className="font-serif text-display-lg font-semibold mb-5">
                Story Protocol is a good diagnosis.
                <br />
                <span className="italic">The wrong architecture.</span>
              </h2>
              <p className="text-text-dim text-[14px] leading-relaxed mb-5">
                Story treats IP as a financial asset to tokenise on a
                proprietary L1. The Jakarta Protocol treats IP as public
                infrastructure to regulate, enforce, and recognise.
              </p>
              <p className="text-text-dim text-[14px] leading-relaxed mb-5">
                Both diagnose the same problem. Only one is structurally
                acceptable to WIPO member states.
              </p>
              <Link
                href="/docs/01_Story_Protocol_Gap_Analysis"
                className="inline-flex items-center gap-2 text-[13.5px] text-accent hover:underline"
              >
                Read the full 12-dimension analysis
                <span aria-hidden>→</span>
              </Link>
            </div>

            <div className="md:col-span-7">
              <div className="border border-border rounded-sm overflow-hidden">
                <div className="grid grid-cols-12 px-5 py-3 border-b border-border bg-bg-elevated/50 text-[11px] font-mono uppercase tracking-widest text-text-muted">
                  <div className="col-span-8">Dimension</div>
                  <div className="col-span-2 text-center">Story</div>
                  <div className="col-span-2 text-center">Jakarta</div>
                </div>
                {COMPARISON.map(([label, story, jakarta], i) => (
                  <div
                    key={i}
                    className="grid grid-cols-12 px-5 py-3 border-b border-border last:border-b-0 items-center text-[13px]"
                  >
                    <div className="col-span-8 text-text-dim">{label}</div>
                    <div className="col-span-2 text-center">
                      <Cell v={story} />
                    </div>
                    <div className="col-span-2 text-center">
                      <Cell v={jakarta} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 font-mono text-[11px] text-text-muted">
                Story: 0/10 unambiguous yes · Jakarta: 10/10
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ AUDIENCES ═══════════════ */}
      <section className="border-b border-border">
        <div className="container-xl py-20">
          <div className="max-w-2xl mb-12">
            <div className="eyebrow mb-5">Pick your path</div>
            <h2 className="font-serif text-display-lg font-semibold">
              Three audiences. One protocol.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-border border border-border">
            {[
              {
                tag: "For creators",
                title: "Register. License. Collect.",
                body: "Hash content, register for $0.004, define licence terms in machine-readable form, collect royalties automatically when licensees self-serve acquire through Hypha.",
                cta: "Register IP",
                href: "/register",
              },
              {
                tag: "Untuk DJKI",
                title: "Pilot recognition in 2027.",
                body: "Baca ringkasan eksekutif dalam Bahasa Indonesia. Tidak ada permintaan dana. Hanya Surat Edaran DJKI yang mengakui MEP sebagai bukti elektronik pelengkap menurut UU ITE Pasal 5.",
                cta: "Baca Ringkasan DJKI",
                href: "/docs/04_DJKI_Executive_Brief",
              },
              {
                tag: "For developers",
                title: "MCP · A2A · UCP.",
                body: "Any AI agent that speaks MCP can register, check, and acquire licences through the Mycelium MCP server. Standard protocols, zero custom SDK. MIT reference implementation on GitHub.",
                cta: "GitHub",
                href: "https://github.com/infia-group/mycelium-network",
              },
            ].map((a) => (
              <div key={a.title} className="bg-bg p-8 flex flex-col">
                <div className="eyebrow mb-5 text-gold">{a.tag}</div>
                <h3 className="font-serif text-[22px] font-semibold mb-4 leading-tight">
                  {a.title}
                </h3>
                <p className="text-[13.5px] text-text-dim leading-relaxed flex-1 mb-6">
                  {a.body}
                </p>
                <Link
                  href={a.href}
                  className="inline-flex items-center gap-2 text-[13.5px] text-accent hover:underline"
                >
                  {a.cta} <span aria-hidden>→</span>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ CLOSING ═══════════════ */}
      <section>
        <div className="container-xl py-24 text-center max-w-3xl">
          <p className="font-serif text-[26px] md:text-[30px] leading-[1.3] italic text-text-dim">
            &ldquo;The mycelium doesn&rsquo;t fight the forest.
            <br />
            It <span className="not-italic text-text">is</span> the
            forest&rsquo;s infrastructure.&rdquo;
          </p>
          <p className="mt-8 font-mono text-[11px] uppercase tracking-widest text-text-muted">
            WIPO is the canopy · The Jakarta Protocol is the mycelium
          </p>
        </div>
      </section>
    </div>
  );
}

// ─── Cell component ───────────────────────────────────────────────

function Cell({ v }: { v: boolean | "partial" | string }) {
  if (v === true) {
    return (
      <span className="inline-block h-4 w-4 rounded-full bg-accent/20 border border-accent">
        <span className="sr-only">Yes</span>
      </span>
    );
  }
  if (v === "partial") {
    return (
      <span className="inline-block h-4 w-4 rounded-full bg-gold/20 border border-gold">
        <span className="sr-only">Partial</span>
      </span>
    );
  }
  return (
    <span className="inline-block h-4 w-4 rounded-full border border-border-strong">
      <span className="sr-only">No</span>
    </span>
  );
}
