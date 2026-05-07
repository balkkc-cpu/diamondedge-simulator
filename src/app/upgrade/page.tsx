import Link from "next/link";
import { DonationCard } from "@/components/DonationCard";

export default function UpgradePage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <section className="panel p-6">
        <h1 className="text-2xl font-bold text-sky-300">DiamondEdge Plus (coming soon)</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-300">
          The web app stays free for research and simulation. A future <strong>Plus</strong> tier could add cloud history
          sync, exportable reports, and priority data refreshes — ideal if you wrap the product for the App Store with
          in-app purchase.
        </p>
        <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-slate-400">
          <li>Today: accounts, saved slips, saved sims, and the wins board ship in this codebase.</li>
          <li>Monetization today: optional supporter links below (your Venmo / PayPal).</li>
          <li>
            App Store later (optional): only if you want a store listing — wrap the same web URL in a small native shell
            + IAP; users never need a second app just to use DiamondEdge in the browser.
          </li>
        </ul>
        <Link href="/bet-builder" className="btn-primary mt-6 inline-block">
          Back to Bet Builder
        </Link>
      </section>
      <DonationCard />
    </main>
  );
}
