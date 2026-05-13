import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", '"Helvetica Neue"', "Arial", "sans-serif"],
        serif: ['"Source Serif 4"', '"Source Serif Pro"', "Georgia", "serif"],
        display: ['"Source Serif 4"', '"Source Serif Pro"', "Georgia", "serif"],
      },
      typography: {
        // Project-tuned prose variant for internal report cards.
        // Use as: className="prose prose-sm prose-report"
        report: {
          css: {
            "--tw-prose-body": "hsl(var(--foreground))",
            "--tw-prose-headings": "hsl(var(--foreground))",
            "--tw-prose-bold": "hsl(var(--foreground))",
            "--tw-prose-links": "hsl(var(--primary))",
            "--tw-prose-quotes": "hsl(var(--muted-foreground))",
            "--tw-prose-quote-borders": "hsl(var(--border))",
            "--tw-prose-bullets": "hsl(var(--muted-foreground))",
            "--tw-prose-counters": "hsl(var(--muted-foreground))",
            "--tw-prose-hr": "hsl(var(--border))",
            "--tw-prose-code": "hsl(var(--foreground))",
            "--tw-prose-pre-code": "hsl(var(--foreground))",
            "--tw-prose-pre-bg": "hsl(var(--muted))",
            color: "hsl(var(--foreground))",
            maxWidth: "none",
            lineHeight: "1.6",
            // Paragraph rhythm — the core fix for run-on cards
            p: { marginTop: "0.75em", marginBottom: "0.75em" },
            // Heading rhythm — formal report feel
            "h1, h2, h3, h4, h5, h6": {
              fontWeight: "600",
              lineHeight: "1.3",
            },
            h1: { fontSize: "1.125rem", marginTop: "1.25em", marginBottom: "0.6em" },
            h2: { fontSize: "1rem", marginTop: "1.2em", marginBottom: "0.5em" },
            h3: { fontSize: "0.95rem", marginTop: "1.1em", marginBottom: "0.45em" },
            h4: { fontSize: "0.9rem", marginTop: "1em", marginBottom: "0.4em" },
            // Lists — clear indent and item spacing
            "ul, ol": {
              marginTop: "0.5em",
              marginBottom: "0.75em",
              paddingLeft: "1.5em",
            },
            li: { marginTop: "0.2em", marginBottom: "0.2em" },
            "li > p": { marginTop: "0.25em", marginBottom: "0.25em" },
            // Blockquotes — used for callouts in some sections
            blockquote: {
              fontStyle: "normal",
              borderLeftWidth: "3px",
              paddingLeft: "0.875em",
              marginTop: "0.75em",
              marginBottom: "0.75em",
              color: "hsl(var(--muted-foreground))",
            },
            // Horizontal rules — keep clear separation
            hr: { marginTop: "1.25em", marginBottom: "1.25em" },
            // Inline + block code
            code: {
              backgroundColor: "hsl(var(--muted))",
              padding: "0.1em 0.35em",
              borderRadius: "0.25rem",
              fontSize: "0.85em",
              fontWeight: "500",
            },
            "code::before": { content: "none" },
            "code::after": { content: "none" },
            pre: {
              backgroundColor: "hsl(var(--muted))",
              color: "hsl(var(--foreground))",
              padding: "0.75em 1em",
              borderRadius: "0.375rem",
              marginTop: "0.75em",
              marginBottom: "0.75em",
            },
            // Tables — keep our existing border treatment from .agent-output
            table: { marginTop: "0.75em", marginBottom: "0.75em" },
            // Strong — ensure bold remains foreground (not blue)
            strong: { color: "hsl(var(--foreground))", fontWeight: "600" },
          },
        },
      },
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
        earth: {
          DEFAULT: "hsl(var(--earth))",
          foreground: "hsl(var(--earth-foreground))",
        },
        sage: {
          DEFAULT: "hsl(var(--sage))",
          foreground: "hsl(var(--sage-foreground))",
        },
        warm: "hsl(var(--warm))",
        "slate-deep": "hsl(var(--slate-deep))",
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // Olimey brand palette — use directly when CSS variables are insufficient
        midnight: "#0A1628",
        ember: "#E8A33D",
        sand: "#D4C5A9",
        ivory: "#F4EDE0",
        "slate-brand": "#2A3A52",
        risk: {
          green: "hsl(var(--risk-green))",
          "green-bg": "hsl(var(--risk-green-bg))",
          amber: "hsl(var(--risk-amber))",
          "amber-bg": "hsl(var(--risk-amber-bg))",
          red: "hsl(var(--risk-red))",
          "red-bg": "hsl(var(--risk-red-bg))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(30px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "collapsible-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-collapsible-content-height)", opacity: "1" },
        },
        "collapsible-up": {
          from: { height: "var(--radix-collapsible-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "collapsible-down": "collapsible-down 0.25s ease-out",
        "collapsible-up": "collapsible-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
