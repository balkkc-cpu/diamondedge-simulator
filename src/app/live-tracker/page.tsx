import { getDailySchedule } from "@/lib/apiClients";
import Link from "next/link";
import { Suspense } from "react";
import { LiveTrackerClient } from "./tracker-client";

export default async function LiveTrackerPage() {
  const games = await getDailySchedule();
  const firstId = games[0]?.id ?? "746791";
  const label = games[0] ? `${games[0].awayTeam} @ ${games[0].homeTeam}` : "Select a game";

  return (
    <main className="grid gap-6">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold text-sky-300">Live Game Tracker</h2>
        <p className="mt-1 text-sm text-slate-400">
          Scoreboard-style view with inning, count, bases, linescore, and live win probability. Refreshes automatically.
          Uses public MLB data only — not a sportsbook.
        </p>
        <p className="mt-2 text-xs text-slate-500">
          <Link className="text-sky-400 underline" href="/bet-builder">
            Bet Builder
          </Link>
        </p>
      </section>

      {games.length > 1 ? (
        <div className="panel p-4">
          <p className="mb-3 text-sm text-slate-400">Quick links (today’s schedule):</p>
          <div className="flex flex-wrap gap-2">
            {games.slice(0, 15).map((g) => (
              <Link
                key={g.id}
                href={`/live-tracker?game=${encodeURIComponent(g.id)}`}
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-sky-500/50 hover:bg-slate-800"
              >
                {g.awayTeam} @ {g.homeTeam}
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <Suspense
        fallback={
          <div className="panel p-8 text-center text-slate-400">Loading tracker…</div>
        }
      >
        <LiveTrackerClient initialPk={firstId} initialLabel={label} games={games} />
      </Suspense>
    </main>
  );
}
