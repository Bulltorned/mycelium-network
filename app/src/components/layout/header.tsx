"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { CLUSTER } from "@/lib/constants";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

const NAV = [
  { href: "/protocol", label: "Protocol" },
  { href: "/registry", label: "Registry" },
  { href: "/register", label: "Register" },
  { href: "/evidence", label: "Evidence" },
  { href: "/docs", label: "Docs" },
];

export function Header() {
  return (
    <header className="border-b border-border bg-bg/90 backdrop-blur-md sticky top-0 z-50">
      <div className="container-xl h-14 flex items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span
              className="h-6 w-6 rounded-full border border-accent-dim bg-gradient-to-br from-accent/20 to-accent-dim/10 grid place-items-center"
              aria-hidden
            >
              <span className="h-2 w-2 rounded-full bg-accent"></span>
            </span>
            <span className="serif text-[17px] tracking-tight">
              <span className="font-semibold">Jakarta</span>
              <span className="text-text-dim"> Protocol</span>
            </span>
            {CLUSTER === "devnet" && (
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-sm bg-gold/10 text-gold border border-gold/30 uppercase tracking-widest">
                Devnet
              </span>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-7">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[13px] text-text-dim hover:text-text transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="https://github.com/infia-group/mycelium-network"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline text-[13px] text-text-dim hover:text-text transition-colors"
          >
            GitHub
          </a>
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}
