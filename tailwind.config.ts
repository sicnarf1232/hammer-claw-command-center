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
        surface: t("--c-surface"),
        surface2: t("--c-surface-2"),
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
        // Workstream identity accents (merit, sloan, personal, shared)
        merit: t("--c-merit"),
        sloan: t("--c-sloan"),
        personal: t("--c-personal"),
        shared: t("--c-shared"),
      },
      borderColor: { DEFAULT: t("--c-border") },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Tightened, consistent scale
        "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.05)",
        elevated: "0 6px 20px -4px rgb(15 23 42 / 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(2px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-in": "fade-in 200ms ease-out" },
    },
  },
  plugins: [],
};

export default config;
