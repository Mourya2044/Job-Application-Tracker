/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          deep: "#080b12",
          DEFAULT: "#0c1019",
          surface: "#131926",
          raised: "#1a2235",
          hover: "#212d45",
        },
        border: {
          DEFAULT: "#253048",
          subtle: "#1c2538",
          accent: "#d4a853",
        },
        brand: {
          DEFAULT: "#d4a853",
          hover: "#e6c06a",
          muted: "rgba(212, 168, 53, 0.12)",
        },
        text: {
          primary: "#f1ede6",
          secondary: "#8f9cb5",
          muted: "#57647d",
        },
        stage: {
          saved: "#94a3b8",
          applied: "#60a5fa",
          screening: "#38bdf8",
          interviewing: "#a78bfa",
          offer: "#34d399",
          accepted: "#10b981",
          rejected: "#fb7185",
          withdrawn: "#64748b",
        },
      },
      fontFamily: {
        sans: ["Outfit", "Inter", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
    },
  },
  plugins: [],
};

