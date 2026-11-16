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
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        floatSlow: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-5px)" },
        },
      },
      animation: {
        shake: "shake 0.4s ease-in-out",
        "pulse-subtle": "pulseSubtle 2s infinite ease-in-out",
        fadeIn: "fadeIn 0.3s ease-out forwards",
        "fade-up": "fadeUp 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scale-in": "scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "float-slow": "floatSlow 4s ease-in-out infinite",
      }
    },
  },
  plugins: [],
};
export default config;
