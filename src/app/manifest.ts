import type { MetadataRoute } from "next";

/** Stable app id for install / stores (don't use only "/" if deploy URL changes). */
const SITE =
  process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://diamond-edge-simulator.vercel.app";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: `${SITE}/`,
    name: "DiamondEdge Simulator",
    short_name: "DiamondEdge",
    description: "MLB simulation and research — not a sportsbook. No wagers.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#070b14",
    theme_color: "#080C17",
    orientation: "portrait-primary",
    categories: ["sports", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      { name: "Bet Builder", short_name: "Builder", url: "/bet-builder" },
      { name: "Live Tracker", short_name: "Live", url: "/live-tracker" }
    ]
  };
}
