import Link from "next/link";
import { CLUSTER } from "@/lib/constants";

export function Footer() {
  return (
    <footer className="border-t border-border mt-24">
      <div className="container-xl py-14">
        <div className="grid md:grid-cols-12 gap-10">
          {/* Brand */}
          <div className="md:col-span-5">
            <div className="flex items-center gap-2.5 mb-4">
              <span
                className="h-6 w-6 rounded-full border border-accent-dim bg-gradient-to-br from-accent/20 to-accent-dim/10 grid place-items-center"
                aria-hidden
              >
                <span className="h-2 w-2 rounded-full bg-accent"></span>
              </span>
              <span className="serif text-[16px]">
                <span className="font-semibold">Jakarta</span>
                <span className="text-text-dim"> Protocol</span>
              </span>
            </div>
            <p className="text-[13px] text-text-muted leading-relaxed max-w-md">
              A WIPO-compatible on-chain evidence standard for programmable
              intellectual property. Chain-neutral specification, open
              reference implementation.
            </p>
            <div className="mt-5 flex items-center gap-3">
              <span className="eyebrow">Status</span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm border border-border-strong text-text-dim uppercase">
                {CLUSTER}
              </span>
              <span className="font-mono text-[11px] px-2 py-0.5 rounded-sm border border-gold/30 text-gold uppercase">
                v1.0 Draft
              </span>
            </div>
          </div>

          {/* Nav */}
          <div className="md:col-span-2">
            <div className="eyebrow mb-4">Protocol</div>
            <ul className="space-y-2.5 text-[13px]">
              <li>
                <Link href="/protocol" className="text-text-dim hover:text-text">
                  Specification
                </Link>
              </li>
              <li>
                <Link href="/registry" className="text-text-dim hover:text-text">
                  Live Registry
                </Link>
              </li>
              <li>
                <Link href="/evidence" className="text-text-dim hover:text-text">
                  Evidence
                </Link>
              </li>
              <li>
                <Link href="/docs" className="text-text-dim hover:text-text">
                  Submission Docs
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-2">
            <div className="eyebrow mb-4">Build</div>
            <ul className="space-y-2.5 text-[13px]">
              <li>
                <a
                  href="https://github.com/infia-group/mycelium-network"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-dim hover:text-text"
                >
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="https://explorer.solana.com/?cluster=devnet"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-dim hover:text-text"
                >
                  Solana Explorer
                </a>
              </li>
              <li>
                <Link href="/register" className="text-text-dim hover:text-text">
                  Register IP
                </Link>
              </li>
            </ul>
          </div>

          <div className="md:col-span-3">
            <div className="eyebrow mb-4">Governance</div>
            <ul className="space-y-2.5 text-[13px] text-text-muted leading-relaxed">
              <li>Mycelium Network Pte Ltd, Singapore</li>
              <li>Anchor partner: INFIA Group, Jakarta</li>
              <li>WIPO observer seat: reserved</li>
              <li className="pt-1">
                Spec: CC-BY 4.0 · Code: MIT
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-[12px] text-text-muted">
          <div>
            <span>&copy; 2026 Mycelium Network Pte Ltd.</span>
            <span className="mx-2">·</span>
            <span>
              The Jakarta Protocol specification is placed under CC-BY 4.0.
            </span>
          </div>
          <div className="font-mono text-[11px]">
            Submitted to WIPO CWS Blockchain Task Force · Jakarta, October 2026
          </div>
        </div>
      </div>
    </footer>
  );
}
