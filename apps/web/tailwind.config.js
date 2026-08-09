/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./apps/web/src/**/*.{js,ts,jsx,tsx,mdx}", "./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        gold: { 50: "#fdf8e8", 100: "#f9edc0", 200: "#f5e297", 300: "#f0d76f", 400: "#eccc47", 500: "#d4af37", 600: "#b5942f", 700: "#967927", 800: "#785e1f", 900: "#594317" },
        charcoal: { 50: "#f6f7f9", 100: "#eceef2", 200: "#d5d9e2", 300: "#b0b9c9", 400: "#8693a8", 500: "#667790", 600: "#526076", 700: "#434e5f", 800: "#3a4350", 900: "#1a1d23" },
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
