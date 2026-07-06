import type { Config } from "tailwindcss";

// Semantic color tokens resolve to CSS variables defined in globals.css, so a
// single `.dark` class on <html> flips the whole palette. `<alpha-value>` lets
// Tailwind opacity modifiers (e.g. bg-danger/10) work on the variables.
const t = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        page: t("--c-page"),
        nav: t("--c-nav"),
        surface: t("--c-surface"),
        surface2: t("--c-surface-2"),
        hi: t("--c-hi"),
        fg: t("--c-fg"),
        muted: t("--c-muted"),
        border: t("--c-border"),
        primary: { DEFAULT: t("--c-primary"), fg: t("--c-primary-fg") },
        accent: t("--c-accent"),
        ring: t("--c-ring"),
        danger: t("--c-danger"),
        warning: t("--c-warning"),
        success: t("--c-success"),
        info: t("--c-info"),
        // Film Room palette
        ink2: t("--c-ink-2"),
        line2: t("--c-line-2"),
        accent2: t("--c-accent-2"),
        accentSoft: t("--c-accent-soft"),
        warm: t("--c-warm"),
        warmSoft: t("--c-warm-soft"),
        due: t("--c-due"),
        dueSoft: t("--c-due-soft"),
        dueInk: t("--c-due-ink"),
        ok: t("--c-ok"),
        okSoft: t("--c-ok-soft"),
        // Workstream identity accents (merit, sloan, personal, shared)
        merit: t("--c-merit"),
        sloan: t("--c-sloan"),
        personal: t("--c-personal"),
        shared: t("--c-shared"),
      },
      borderColor: { DEFAULT: t("--c-border") },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Tightened, consistent scale
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px
      },
      borderRadius: {
        sm: "6px",
        md: "9px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        card: "0 2px 14px rgb(54 179 166 / 0.05)",
        elevated: "0 10px 24px rgb(54 179 166 / 0.12)",
        seaglass: "0 8px 20px rgb(54 179 166 / 0.28)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-in": "fade-in 320ms cubic-bezier(0.22,1,0.36,1)" },
    },
  },
  plugins: [],
};

export default config;
