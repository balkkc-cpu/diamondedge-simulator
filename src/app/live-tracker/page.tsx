import { getDailySchedule } from "@/lib/apiClients";
import { fetchNbaScoreboardGameCards } from "@/lib/nbaScoreboard";
import { parseSportCode } from "@/lib/sportContext";
import Link from "next/link";
import { Suspense } from "react";
import { LiveTrackerClient } from "./tracker-client";
import { NbaTrackerClient } from "./nba-tracker-client";

export const dynamic = "force-dynamic";

export default async function LiveTrackerPage({ searchParams }: { searchParams?: { sport?: string; game?: string } }) {
  const sport = parseSportCode(searchParams?.sport);

  if (sport === "nba") {
    const games = await fetchNbaScoreboardGameCards();
    const qGame = searchParams?.game?.trim();
    const preferred =
      games.find((g) => /q[1-4]|half|ot|live|final/i.test(g.status)) ??
      games.find((g) => /\d{1,2}:\d{2}/.test(g.status)) ??
      games[0];
    const validBookmark = qGame && /^\d{10}$/.test(qGame);
    const firstId = validBookmark ? qGame : preferred?.id ?? games[0]?.id ?? "";
    const gamesForUi =
      validBookmark && !games.some((g) => g.id === qGame)
        ? [
            ...games,
            {
              id: qGame,
              startTime: new Date().toISOString(),
              status: "Selected",
              homeTeam: "Home (open tracker to load)",
              awayTeam: "Away (open tracker to load)",
              weather: "Indoor",
              ballpark: "NBA",
              probablePitchers: "—",
              delayInfo: null
            }
          ]
        : games;
    const label = preferred ? `${preferred.awayTeam} @ ${preferred.homeTeam}` : "Select an NBA game";

    return (
      <main className="grid gap-6">
        <section className="panel p-4">
          <h2 className="text-xl font-semibold text-amber-300">NBA live tracker</h2>
          <p className="mt-1 text-sm text-slate-400">
            Animated court with shot locations (made/miss), recent rebounds and assists from play-by-play, live box score
            stats, and game clock — powered by the public NBA.com live data feed. Not a sportsbook.
          </p>
          <p className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
            <Link className="text-sky-400 underline" href="/live-tracker">
              MLB tracker
            </Link>
            <span className="text-slate-600">·</span>
            <Link className="text-amber-300 underline" href="/live-tracker?sport=nba">
              NBA tracker
            </Link>
            <span className="text-slate-600">·</span>
            <Link className="text-sky-400 underline" href="/bet-builder?sport=nba">
              Bet Builder (NBA)
            </Link>
          </p>
        </section>

        {games.length > 1 ? (
          <div className="panel p-4">
            <p className="mb-3 text-sm text-slate-400">Today&apos;s NBA games (scoreboard):</p>
            <div className="flex flex-wrap gap-2">
              {games.slice(0, 20).map((g) => (
                <Link
                  key={g.id}
                  href={`/live-tracker?sport=nba&game=${encodeURIComponent(g.id)}`}
                  className="rounded-lg border border-amber-900/50 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:border-amber-500/60 hover:bg-slate-800"
                >
                  {g.awayTeam} @ {g.homeTeam}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          <div className="panel p-4 text-sm text-slate-400">
            No NBA games on the league scoreboard for this calendar day (or the feed did not load). Try again on a game
            day.
          </div>
        )}

        {firstId ? (
          <Suspense fallback={<div className="panel p-8 text-center text-slate-400">Loading NBA tracker…</div>}>
            <NbaTrackerClient initialGameId={firstId} initialLabel={label} games={gamesForUi.length ? gamesForUi : []} />
          </Suspense>
        ) : null}
      </main>
    );
  }

  const games = await getDailySchedule();
  const preferred =
    games.find((g) => /live|in progress/i.test(g.status)) ??
    games.find((g) => /pre-?game|warmup|delayed/i.test(g.status)) ??
    games[0];
  const firstId = preferred?.id ?? "746791";
  const label = preferred ? `${preferred.awayTeam} @ ${preferred.homeTeam}` : "Select a game";

  return (
    <main className="grid gap-6">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold text-sky-300">Live Game Tracker</h2>
        <p className="mt-1 text-sm text-slate-400">
          Scoreboard-style view with inning, count, bases, linescore, and live win probability. Refreshes automatically.
          Uses public MLB data only — not a sportsbook.
        </p>
        <p className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
          <Link className="text-sky-400 underline" href="/bet-builder">
            Bet Builder
          </Link>
          <span className="text-slate-600">·</span>
          <Link className="text-amber-300 underline" href="/live-tracker?sport=nba">
            NBA live tracker (court + shots)
          </Link>
        </p>
      </section>

      {games.length > 1 ? (
        <div className="panel p-4">
          <p className="mb-3 text-sm text-slate-400">Quick links (today&apos;s schedule):</p>
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

      <Suspense fallback={<div className="panel p-8 text-center text-slate-400">Loading tracker…</div>}>
        <LiveTrackerClient initialPk={firstId} initialLabel={label} games={games} />
      </Suspense>
    </main>
  );
}
