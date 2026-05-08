import Link from "next/link";
import { getDailyPicksPayload } from "@/lib/dailyPicks";
import { getAllMarkets, getDailySchedule, getInjuries, getWeatherFallback } from "@/lib/apiClients";
import { DashboardSuggestedPicks } from "@/components/DashboardSuggestedPicks";
import { DonationCard } from "@/components/DonationCard";
import { GameCard } from "@/lib/types";
import { buildSuggestedParlaysFromBoard } from "@/lib/suggestedParlays";
import { DashboardSuggestedParlays } from "@/components/DashboardSuggestedParlays";
import { DashboardCoachTab } from "@/components/DashboardCoachTab";
import { DashboardHighlights } from "@/components/DashboardHighlights";

export default async function DashboardPage() {
  const games: GameCard[] = await getDailySchedule();
  const injuries = await getInjuries();
  const weather = await getWeatherFallback();
  const daily = await getDailyPicksPayload();
  const allMarkets = await getAllMarkets();
  const parlays = await buildSuggestedParlaysFromBoard({ games, markets: allMarkets, parlayLegs: 3 });

  return (
    <main className="grid gap-4">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold text-blue-200">Dashboard</h2>
        <p className="text-sm text-slate-300">
          Today&apos;s games, suggested straights with sim reasoning, injuries, and weather. Simulation estimates only — not
          a sportsbook.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-3 lg:items-stretch">
        <div className="panel flex flex-col p-4">
          <h3 className="mb-3 shrink-0 text-lg font-semibold text-slate-100">Today&apos;s MLB games</h3>
          <div className="thin-scrollbar min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {games.map((g) => (
              <Link key={g.id} href={`/games/${g.id}`} className="block rounded-lg bg-slate-900 p-3 transition hover:bg-slate-800">
                <div className="font-semibold text-slate-100">
                  {g.awayTeam} @ {g.homeTeam}
                </div>
                <div className="text-xs text-slate-400">
                  {new Date(g.startTime).toLocaleString()} · {g.status} · {g.weather}
                </div>
                {g.delayInfo ? (
                  <div className="mt-1 text-xs font-medium text-amber-300/90">Status: {g.delayInfo}</div>
                ) : null}
                <div className="mt-1 text-xs text-slate-500">
                  {g.ballpark} · {g.probablePitchers}
                </div>
              </Link>
            ))}
          </div>
          <p className="mt-3 shrink-0 text-[11px] text-slate-500">
            Need lines? Open{" "}
            <Link href="/bet-builder" className="text-sky-400 underline">
              Bet Builder
            </Link>{" "}
            for the full board per game.
          </p>
        </div>

        <DashboardSuggestedPicks picks={daily.picks} />
        <DashboardSuggestedParlays parlays={parlays} initialLegs={3} />
      </section>

      <DashboardCoachTab />
      <DashboardHighlights />

      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4 text-sm">
          <h3 className="font-semibold text-slate-100">Injuries</h3>
          <p className="mb-2 text-[11px] text-slate-500">MLB 40-man roster status for teams on today&apos;s slate (hourly cache).</p>
          <div className="thin-scrollbar max-h-48 space-y-1 overflow-y-auto">
            {injuries.slice(0, 18).map((i: { playerName: string; status: string }, idx: number) => (
              <p key={idx} className="text-slate-300">
                <span className="font-medium text-slate-200">{i.playerName}</span>: {i.status}
              </p>
            ))}
            {injuries.length > 18 ? (
              <p className="pt-1 text-[11px] text-slate-500">+{injuries.length - 18} more on IL-style rows (feed is capped here).</p>
            ) : null}
          </div>
        </div>
        <div className="panel p-4 text-sm">
          <h3 className="font-semibold text-slate-100">Weather</h3>
          <p className="text-slate-300">{weather.summary}</p>
          <Link href="/community" className="btn-muted mt-4 inline-block text-xs">
            Community wins board
          </Link>
        </div>
      </section>
      <DonationCard />
    </main>
  );
}
