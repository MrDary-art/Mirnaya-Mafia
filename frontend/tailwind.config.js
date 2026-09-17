/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070b14",
        panel: "rgba(14, 22, 40, 0.72)",
      },
      boxShadow: {
        neon: "0 0 40px rgba(34, 211, 238, 0.18)",
      },
    },
  },
  plugins: [],
};
