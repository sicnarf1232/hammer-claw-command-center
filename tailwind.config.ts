import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Workstream accents (used to tag notes / emails by identity)
        merit: "#1d4ed8",
        sloan: "#0d9488",
        personal: "#64748b",
        shared: "#94a3b8",
      },
    },
  },
  plugins: [],
};

export default config;
