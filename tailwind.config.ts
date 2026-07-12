import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0A0A0A",
        card: "rgba(255,255,255,0.04)",
        "card-hover": "rgba(255,255,255,0.08)",
        border: "rgba(255,255,255,0.10)",
        accent: "#6C7BFF",
        muted: "rgba(255,255,255,0.6)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
