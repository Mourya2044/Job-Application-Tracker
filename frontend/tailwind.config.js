/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // code.html exact palette
        hired: {
          bgdeep: "#080b12",
          bg: "#0c1019",
          surface: "#131926",
          raised: "#1a2235",
          hover: "#212d45",
          border: "#253048",
          accent: "#d4a853",
          accentHover: "#e6c06a",
          accentMuted: "rgba(212, 168, 53, 0.1)",
          text: "#e8e4dc",
          textSec: "#8a94a8",
          textMuted: "#556178",
          success: "#4ade80",
          successMuted: "rgba(74, 222, 128, 0.1)",
          warning: "#fbbf24",
          warningMuted: "rgba(251, 191, 36, 0.1)",
          danger: "#fb7185",
          dangerMuted: "rgba(251, 113, 133, 0.1)",
          info: "#60a5fa",
          infoMuted: "rgba(96, 165, 250, 0.1)",
          interview: "#a78bfa",
          interviewMuted: "rgba(167, 139, 250, 0.1)",
        }
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        body: ['Lora', 'Georgia', 'serif'],
        mono: ['"DM Mono"', 'Courier New', 'monospace'],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        lg: "12px",
        md: "8px",
        sm: "6px",
      },
    },
  },
  plugins: [],
}
