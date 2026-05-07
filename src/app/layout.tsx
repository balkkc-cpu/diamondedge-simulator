import "./globals.css";
import type { Metadata, Viewport } from "next";
import { BrandLogo } from "@/components/BrandLogo";
import { InstallWebsiteHint } from "@/components/InstallWebsiteHint";
import { SiteNav } from "@/components/SiteNav";

export const metadata: Metadata = {
  title: "DiamondEdge Simulator",
  description: "MLB betting simulation estimates only. No wagers are placed.",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }
    ],
    apple: [{ url: "/icons/icon-192.png" }]
  },
  appleWebApp: {
    capable: true,
    title: "DiamondEdge",
    statusBarStyle: "black-translucent"
  },
  formatDetection: {
    telephone: false
  }
};

export const viewport: Viewport = {
  themeColor: "#080C17",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        className="min-h-screen antialiased"
        style={{
          backgroundColor: "#070b14",
          color: "#e5e7eb",
          minHeight: "100vh"
        }}
      >
        <div className="mx-auto max-w-7xl px-4 py-5 md:px-6">
          <header className="mb-4 panel p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <BrandLogo size="md" />
                  <div>
                    <p className="text-xs text-slate-300">
                      Simulation estimates only. No betting, payments, sportsbook connectivity, or guaranteed outcomes.
                    </p>
                  </div>
                </div>
              </div>
              <SiteNav />
            </div>
          </header>
          <InstallWebsiteHint />
          {children}
        </div>
      </body>
    </html>
  );
}
