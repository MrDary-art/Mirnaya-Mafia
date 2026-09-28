/** @type {import('tailwindcss').Config} */
// Existing utility classes share the canonical tokens, including opacity variants.
const tokenScale = (token) => Object.fromEntries(
  ["DEFAULT", 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(
    (shade) => [shade, `rgb(var(${token}) / <alpha-value>)`],
  ),
);

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--bg-deep-rgb) / <alpha-value>)",
        panel: "var(--surface-glass)",
        lime: tokenScale("--accent-lime-rgb"),
        amber: tokenScale("--accent-peach-rgb"),
        yellow: tokenScale("--accent-peach-rgb"),
        rose: tokenScale("--state-danger-rgb"),
        red: tokenScale("--state-danger-rgb"),
      },
      boxShadow: {
        neon: "0 0 40px var(--accent-lime-soft)",
      },
    },
  },
  plugins: [],
};
