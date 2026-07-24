import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#000000",
        foreground: "#F4F6FA",
        card: "rgba(244,246,250,0.04)",
        "card-hover": "rgba(244,246,250,0.08)",
        border: "rgba(244,246,250,0.10)",
        accent: "#1E3AFF",
        muted: "rgba(244,246,250,0.6)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
