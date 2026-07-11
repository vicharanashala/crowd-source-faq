/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1C2321",
        parchment: "#FAF7F0",
        moss: "#3B6255",
        mossLight: "#E7EFEA",
        clay: "#B65C3D",
        gold: "#C79A3A",
        slate: "#5B6B67",
        line: "#DDE3DE",
      },
      fontFamily: {
        display: ["'Fraunces'", "serif"],
        body: ["'Inter'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};
