import type { Metadata } from "next";
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";
import { SolanaProviders } from "@/components/wallet/wallet-provider";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--serif",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Jakarta Protocol — WIPO-Compatible On-Chain IP Evidence Standard",
  description:
    "A chain-neutral, token-free specification for on-chain intellectual property evidence. Submitted to WIPO CWS Task 59, October 2026. Reference implementation: Mycelium Network on Solana.",
  keywords: [
    "WIPO",
    "Jakarta Protocol",
    "Mycelium Network",
    "blockchain IP",
    "Solana",
    "DJKI",
    "UU ITE",
    "intellectual property",
    "evidence",
    "Global South",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`dark ${inter.variable} ${fraunces.variable} ${jetbrains.variable}`}
    >
      <body className="min-h-screen flex flex-col">
        <QueryProvider>
          <SolanaProviders>
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </SolanaProviders>
        </QueryProvider>
      </body>
    </html>
  );
}
