/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/Prototype.tsx",
    "./stitch-export/stitch_meal_planner_food_components/*/code.html",
  ],
  important: "[data-phone-screen]",
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#111111", light: "#EEEEEE", pale: "#EEEEEE" },
        background: "#F4F4F4",
        surface: "#FFFFFF",
        divider: "#E0E0E0",
        warning: "#F57C00",
        overlay: "rgba(0,0,0,.4)",
        textMain: "#1A1A1A",
        textSub: "#44474E",
        textPrimary: "#1F2937",
        textSecondary: "#6B7280",
        text: { main: "#333333", sub: "#666666", muted: "#777777", disabled: "#999999" },
        brand: { DEFAULT: "#111111", blue: "#111111", pale: "#E5E5E5", bg: "#F4F4F4", empty: "#EFEFEF", text: "#222222", dark: "#222222", gray: "#777777", subtext: "#666666" },
        base: { bg: "#F4F4F4" },
        pale: { blue: "#E5E5E5" },
        charcoal: "#333333",
        error: "#F05A28",
        "border-color": "#E5E7EB",
        "border-light": "#E5E7EB",
        "light-gray": "#F4F4F4",
        "cool-gray": "#6B7280",
        "empty-gray": "#A0A0A0",
      },
      borderRadius: { DEFAULT: ".5rem", lg: "1rem", xl: "1.5rem" },
      fontFamily: {
        headline: ["Noto Sans JP", "sans-serif"],
        display: ["Noto Sans JP", "sans-serif"],
        body: ["Noto Sans JP", "sans-serif"],
        label: ["Noto Sans JP", "sans-serif"],
      },
      boxShadow: { soft: "0 2px 8px -2px rgba(0,0,0,.05)" },
    },
  },
};
