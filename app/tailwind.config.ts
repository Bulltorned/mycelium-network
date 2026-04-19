import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        surface: "var(--surface)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-dim": "var(--text-dim)",
        "text-muted": "var(--text-muted)",
        accent: "var(--accent)",
        "accent-dim": "var(--accent-dim)",
        gold: "var(--gold)",
        "gold-dim": "var(--gold-dim)",
        danger: "var(--danger)",
      },
      fontFamily: {
        sans: ["var(--sans)"],
        serif: ["var(--serif)"],
        mono: ["var(--mono)"],
      },
      fontSize: {
        "display-xl": ["clamp(2.5rem, 5vw, 4.5rem)", { lineHeight: "1.05", letterSpacing: "-0.02em" }],
        "display-lg": ["clamp(2rem, 3.5vw, 3rem)", { lineHeight: "1.1", letterSpacing: "-0.015em" }],
      },
    },
  },
  plugins: [],
};

export default config;
