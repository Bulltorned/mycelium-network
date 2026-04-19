import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";

const SUBMISSION_DIR = path.resolve(
  process.cwd(),
  "../submissions/wipo-jakarta-2026"
);

const SLUGS = new Set([
  "00_Jakarta_Protocol_Submission",
  "01_Story_Protocol_Gap_Analysis",
  "02_MEP_Sample_Document",
  "03_WIPO_CWS_Task59_Compatibility_Matrix",
  "04_DJKI_Executive_Brief",
  "05_Technical_Appendix",
]);

type Params = Promise<{ slug: string }>;

export async function generateStaticParams() {
  return Array.from(SLUGS).map((slug) => ({ slug }));
}

function loadDoc(slug: string): { ext: "md" | "json"; body: string } | null {
  const candidates = [
    { ext: "md" as const, file: path.join(SUBMISSION_DIR, `${slug}.md`) },
    { ext: "json" as const, file: path.join(SUBMISSION_DIR, `${slug}.json`) },
  ];
  for (const c of candidates) {
    try {
      const body = fs.readFileSync(c.file, "utf-8");
      return { ext: c.ext, body };
    } catch {
      continue;
    }
  }
  return null;
}

export default async function DocPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!SLUGS.has(slug)) notFound();
  const doc = loadDoc(slug);
  if (!doc) notFound();

  return (
    <article className="container-xl py-12 max-w-3xl">
      <Link
        href="/docs"
        className="text-[13px] text-text-muted hover:text-text inline-flex items-center gap-2 mb-8"
      >
        <span aria-hidden>←</span> Back to submission index
      </Link>

      <div className="eyebrow mb-3">
        {doc.ext === "json"
          ? "Sample artifact (JSON)"
          : "Submission document"}
      </div>

      <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.7] text-text-dim bg-bg-elevated/40 border border-border rounded-sm p-6 overflow-x-auto">
        {doc.body}
      </pre>

      <p className="text-[12px] text-text-muted mt-8 leading-relaxed">
        Specification content licensed under CC-BY 4.0. Reference implementation
        MIT. Adapt, fork, improve — the Jakarta Protocol is a standard, not a
        product.
      </p>
    </article>
  );
}
