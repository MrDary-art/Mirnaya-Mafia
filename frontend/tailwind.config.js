/** @type {import('tailwindcss').Config} */
// All utility names, including old colour aliases, resolve to the forest palette.
const color = token => `rgb(var(--forest-${token}-rgb) / <alpha-value>)`;
const forestScale = {
  DEFAULT: color("moss"), 50: color("paper"), 100: color("paper"),
  200: color("sage"), 300: color("sage"), 400: color("eucalyptus"),
  500: color("moss"), 600: color("moss"), 700: color("moss"),
  800: color("ink"), 900: color("ink"), 950: color("ink"),
};
const compatibleColors = Object.fromEntries(
  ["slate", "gray", "zinc", "neutral", "stone", "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose"].map(name => [name, forestScale]),
);

export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    ringColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: "#1f4d3a" }),
    ringOffsetColor: ({ theme }) => ({ ...theme("colors"), DEFAULT: "#e7f1ec" }),
    dropShadow: {
      sm: "0 1px 2px rgb(2 46 36 / .12)", DEFAULT: "0 2px 3px rgb(2 46 36 / .16)",
      md: "0 4px 5px rgb(2 46 36 / .18)", lg: "0 10px 8px rgb(2 46 36 / .2)",
      xl: "0 20px 14px rgb(2 46 36 / .22)", "2xl": "0 25px 25px rgb(2 46 36 / .28)", none: "0 0 rgb(2 46 36 / 0)",
    },
    boxShadow: {
      sm: "0 1px 2px rgb(2 46 36 / .08)",
      DEFAULT: "0 2px 5px rgb(2 46 36 / .12)",
      md: "0 4px 8px rgb(2 46 36 / .14)",
      lg: "0 10px 18px rgb(2 46 36 / .16)",
      xl: "0 20px 28px rgb(2 46 36 / .18)",
      "2xl": "0 25px 50px rgb(2 46 36 / .24)",
      inner: "inset 0 2px 4px rgb(2 46 36 / .12)",
      none: "none", neon: "0 12px 32px rgb(2 46 36 / .18)",
    },
    colors: {
      inherit: "inherit", current: "currentColor", transparent: "transparent",
      black: color("ink"), white: color("paper"),
      ...compatibleColors,
      forest: Object.fromEntries(["ink", "moss", "eucalyptus", "sage", "paper"].map(name => [name, color(name)])),
      ink: "rgb(var(--bg-deep-rgb) / <alpha-value>)",
      panel: "var(--surface-glass)",
    },
  },
  plugins: [],
};
