/** @type {import('tailwindcss').Config} */

// Every colour resolves through a CSS variable, so the entire identity is
// one file (src/app/globals.css). Changing the brand is a token edit, never
// a sweep across pages.
const v = (name) => ({ opacityValue }) =>
  opacityValue === undefined
    ? `rgb(var(--${name}))`
    : `rgb(var(--${name}) / ${opacityValue})`;

const scale = (prefix, steps) =>
  Object.fromEntries(steps.map((s) => [s, v(`${prefix}-${s}`)]));

module.exports = {
  darkMode: "class",
  content: ["./apps/web/src/**/*.{js,ts,jsx,tsx,mdx}", "./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        qano: scale("qano", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        alert: scale("alert", [50, 100, 300, 400, 500, 600, 700]),
        ink: scale("ink", [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]),
        danger: scale("danger", [50, 400, 500, 600]),

        // Semantic aliases — prefer these in new code.
        bg: v("bg"),
        surface: v("surface"),
        "surface-2": v("surface-2"),
        line: v("border"),
        "line-strong": v("border-strong"),
        content: v("text"),
        muted: v("text-muted"),
        faint: v("text-faint"),
        brand: v("brand"),
        "brand-fg": v("brand-fg"),

        // The frame (sidebar) is dark in both modes.
        frame: v("frame"),
        "frame-2": v("frame-2"),
        "frame-line": v("frame-line"),
        "frame-text": v("frame-text"),
        "frame-muted": v("frame-muted"),
        "frame-brand": v("frame-brand"),

        // Legacy aliases. 29 pages still reference gold-*/charcoal-*; mapping
        // them onto the new scales means the whole app picks up the identity
        // immediately and each page can be migrated on its own schedule.
        gold: scale("qano", [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        charcoal: {
          50: v("ink-25"), 100: v("ink-50"), 200: v("ink-100"), 300: v("ink-300"),
          400: v("ink-400"), 500: v("ink-500"), 600: v("ink-600"), 700: v("ink-700"),
          800: v("ink-900"), 900: v("ink-950"),
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "Cascadia Mono", "Consolas", "monospace"],
      },
      fontSize: {
        micro: ["11.5px", { lineHeight: "1.35", letterSpacing: "0.02em" }],
        label: ["13px", { lineHeight: "1.45" }],
        data: ["13.5px", { lineHeight: "1.45" }],
        base: ["15px", { lineHeight: "1.7" }],
        title: ["20px", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        display: ["28px", { lineHeight: "1.25", letterSpacing: "-0.02em" }],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        // Shadows carry a teal cast so they sit in the palette rather than
        // greying it down.
        card: "0 1px 2px 0 rgb(8 18 20 / 0.05)",
        raised: "0 2px 8px -2px rgb(8 18 20 / 0.10), 0 1px 3px -1px rgb(8 18 20 / 0.06)",
        pop: "0 12px 32px -8px rgb(8 18 20 / 0.22)",
      },
      keyframes: {
        "fade-up": { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
      },
      animation: {
        "fade-up": "fade-up 180ms ease-out both",
      },
    },
  },
  plugins: [],
};
