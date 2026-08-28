import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#070709",
        foreground: "#F4F6FA",
        card: "#0D0D10",
        "card-hover": "#121217",
        border: "rgba(255,255,255,0.08)",
        accent: "#4F46FF",
        "accent-2": "#6D28FF",
        muted: "rgba(244,246,250,0.62)",
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "Apple Color Emoji",
          "Segoe UI Emoji",
          "Noto Color Emoji",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
