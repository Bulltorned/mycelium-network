import Link from "next/link";

const DOCS = [
  { num: "00", slug: "00_Jakarta_Protocol_Submission", title: "Jakarta Protocol Submission", desc: "Main proposal — 18 sections, MEP schema v1.0, 12-dim Story analysis, Indonesia pilot.", len: "45 min read" },
  { num: "01", slug: "01_Story_Protocol_Gap_Analysis", title: "Story Protocol Gap Analysis", desc: "12-dimension technical comparison across standards-body dimensions.", len: "20 min read" },
  { num: "02", slug: "02_MEP_Sample_Document", title: "MEP Sample Document (JSON)", desc: "Fully populated Mycelium Evidence Package — Tahilalats case.", len: "10 min read" },
  { num: "03", slug: "03_WIPO_CWS_Task59_Compatibility_Matrix", title: "WIPO CWS Task 59 Matrix", desc: "14 concerns × Jakarta Protocol architectural responses.", len: "25 min read" },
  { num: "04", slug: "04_DJKI_Executive_Brief", title: "DJKI Executive Brief", desc: "Ringkasan eksekutif dalam Bahasa Indonesia untuk DJKI.", len: "15 min · id-ID" },
  { num: "05", slug: "05_Technical_Appendix", title: "Technical Appendix", desc: "Cryptographic spec, Ed25519 strict-mode verify, canonical JSON, account schemas.", len: "30 min read" },
];

export default function DocsIndex() {
  return (
    <div className="container-xl py-20">
      <div className="mb-12">
        <div className="eyebrow mb-4">Submission package</div>
        <h1 className="font-serif text-display-lg font-semibold mb-4">
          Jakarta Protocol documents
        </h1>
        <p className="text-text-dim text-[15px] max-w-2xl leading-relaxed">
          CC-BY 4.0 specification. Free to adopt, adapt, fork. The reference
          implementation is MIT at{" "}
          <a
            href="https://github.com/infia-group/mycelium-network"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline"
          >
            github.com/infia-group/mycelium-network
          </a>
          .
        </p>
      </div>

      <div className="divide-y divide-border border border-border rounded-sm">
        {DOCS.map((d) => (
          <Link
            key={d.num}
            href={`/docs/${d.slug}`}
            className="block p-5 hover:bg-bg-elevated/60 transition-colors group"
          >
            <div className="flex items-start gap-5">
              <div className="font-mono text-[11px] text-text-muted pt-1 min-w-[28px]">
                {d.num}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-4 mb-1">
                  <h2 className="font-serif text-[17px] font-semibold group-hover:text-accent transition-colors">
                    {d.title}
                  </h2>
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
  );
}
