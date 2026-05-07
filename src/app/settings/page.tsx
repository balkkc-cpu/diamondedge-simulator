import Link from "next/link";
import { DonationCard } from "@/components/DonationCard";

export default function SettingsPage() {
  return (
    <main className="grid gap-4">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold text-blue-200">Settings</h2>
        <p className="text-sm text-slate-300">
          Configure API keys, simulation defaults, bankroll presets, and responsible-use messaging.
        </p>
      </section>
      <section className="panel p-4 text-sm">
        <h3 className="font-semibold">Legal and Safety</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-300">
          <li>No wager processing.</li>
          <li>No sportsbook account linking.</li>
          <li>No payment processing.</li>
          <li>Simulation estimates only.</li>
          <li>No outcome is guaranteed.</li>
        </ul>
      </section>
      <DonationCard />
      <section className="panel p-4 text-sm">
        <h3 className="font-semibold">Owner Controls</h3>
        <p className="text-slate-300">
          Master account login:
          <Link href="/master-login" className="ml-1 text-blue-300 underline">
            /master-login
          </Link>
        </p>
      </section>
    </main>
  );
}
