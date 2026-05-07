import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#080C17",
        panel: "#111A2E",
        positive: "#34D399",
        negative: "#F87171",
        accent: "#60A5FA"
      }
    }
  },
  plugins: []
};

export default config;
