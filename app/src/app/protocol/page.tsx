import Link from "next/link";

export default function ProtocolPage() {
  return (
    <div className="container-xl py-20 max-w-4xl">
      <div className="eyebrow mb-4">Specification v1.0</div>
      <h1 className="font-serif text-display-lg font-semibold mb-6">
        The Jakarta Protocol
      </h1>
      <p className="text-[17px] text-text-dim leading-relaxed mb-10">
        A chain-neutral, token-free specification for on-chain intellectual
        property evidence. Four normative components.
      </p>

      <div className="grid md:grid-cols-2 gap-px bg-border border border-border rounded-sm overflow-hidden mb-12">
        {[
          { s: "§4", title: "MEP Schema", body: "Canonical JSON structure for the Mycelium Evidence Package. SHA-256 over JCS RFC 8785 canonicalized bytes, Ed25519 signature by declared protocol authority." },
          { s: "§5", title: "Registration Profile", body: "Minimum on-chain fields a Jakarta-compliant registration must emit. Content hash, perceptual hash, Nice Classification, Berne Category, ISO 3166 country." },
          { s: "§6", title: "Licensing Profile", body: "Machine-readable licence template fields. Mandatory ai_training_allowed flag. 4 archetypes: CreativeCommons, Commercial, Exclusive, AITraining. Territory + duration + royalty bps." },
          { s: "§7", title: "Recognition Procedure", body: "How a national IP office or court recognises an MEP as supplementary electronic evidence. Minimum 5-step checklist. No treaty amendment required." },
        ].map((c) => (
          <div key={c.s} className="bg-bg p-7">
            <div className="font-mono text-[11px] text-gold uppercase tracking-widest mb-3">
              {c.s}
            </div>
            <h2 className="font-serif text-[20px] font-semibold mb-3">
              {c.title}
            </h2>
            <p className="text-[13.5px] text-text-dim leading-relaxed">
              {c.body}
            </p>
          </div>
        ))}
      </div>

      <h2 className="font-serif text-[26px] font-semibold mb-4">
        Design principles
      </h2>
      <ol className="space-y-3 text-[14px] text-text-dim leading-relaxed mb-10">
        {[
          ["Completes, does not compete.", "WIPO-administered registries remain authoritative. The Protocol adds a complementary evidence layer."],
          ["Chain-neutral.", "Any chain meeting §4.4 cryptographic requirements can emit a valid MEP. Solana is a reference, not a mandate."],
          ["No token, no gate.", "A standard requiring a volatile asset to use it cannot be global public infrastructure."],
          ["Court-verifiable with a web browser.", "Every MEP must be verifiable by a non-technical judge in under 15 minutes without specialised software."],
          ["Jurisdiction-aware by default.", "Each MEP is formatted for a specific jurisdiction's evidentiary framework."],
          ["AI-native.", "Every tool exposed through MCP + A2A + UCP industry-standard protocols. No custom agent protocol permitted."],
          ["Global South access fund.", "10% of protocol revenue flows to an independently governed fund that subsidises LMIC/LIC creators."],
        ].map((p, i) => (
          <li key={i} className="flex gap-4">
            <span className="font-mono text-[11px] text-text-muted pt-1">
              0{i + 1}
            </span>
            <div>
              <span className="text-text font-medium">{p[0]}</span>{" "}
              <span>{p[1]}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="border-t border-border pt-8 flex flex-wrap gap-3">
        <Link
          href="/docs/00_Jakarta_Protocol_Submission"
          className="inline-flex items-center gap-2 px-5 h-11 bg-text text-bg rounded-sm text-[14px] font-medium hover:bg-text-dim transition-colors"
        >
          Read the full submission <span aria-hidden>→</span>
        </Link>
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 px-5 h-11 border border-border-strong text-text rounded-sm text-[14px] font-medium hover:border-text-muted transition-colors"
        >
          All documents
        </Link>
        <a
          href="https://github.com/infia-group/mycelium-network"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 h-11 text-[14px] text-text-dim hover:text-text transition-colors"
        >
          GitHub reference implementation
        </a>
      </div>
    </div>
  );
}
