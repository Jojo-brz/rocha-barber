import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#07090e",
        surface: {
          DEFAULT: "#0f1523",
          hover: "#141d30",
          card: "rgba(15, 21, 35, 0.75)",
          border: "rgba(255, 255, 255, 0.08)",
        },
        brand: {
          gold: "#d4af37",
          amber: "#f59e0b",
          darkGold: "#997b19",
        },
        emerald: {
          glow: "rgba(16, 185, 129, 0.15)",
        }
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 25px -5px rgba(212, 175, 55, 0.2)",
        "emerald-glow": "0 0 25px -5px rgba(16, 185, 129, 0.25)",
      },
      keyframes: {
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-6px)" },
          "40%, 80%": { transform: "translateX(6px)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        }
      },
      animation: {
        shake: "shake 0.4s ease-in-out",
        "pulse-subtle": "pulseSubtle 2s infinite ease-in-out",
      }
    },
  },
  plugins: [],
};
export default config;
