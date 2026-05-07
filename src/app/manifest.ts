import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DiamondEdge Simulator",
    short_name: "DiamondEdge",
    description: "MLB simulation and research — not a sportsbook. No wagers.",
    start_url: "/",
    display: "standalone",
    background_color: "#070b14",
    theme_color: "#080C17",
    orientation: "portrait-primary",
    categories: ["sports", "utilities"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any"
      }
    ]
  };
}
