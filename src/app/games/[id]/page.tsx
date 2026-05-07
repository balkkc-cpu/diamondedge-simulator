import Link from "next/link";
import { getDailySchedule, getGameDetail, getOddsMarkets } from "@/lib/apiClients";
import { isPlayerPropMarketType } from "@/lib/odds";
import { GameCard, GameDetail, Market } from "@/lib/types";

export default async function GameDetailPage({ params }: { params: { id: string } }) {
  const games: GameCard[] = await getDailySchedule();
  const game = games.find((g) => g.id === params.id) ?? games[0];
  const allForGame: Market[] = await getOddsMarkets(game?.id ?? "mock-game-001");
  const lineMarkets = allForGame.filter((m) => !isPlayerPropMarketType(m.marketType));
  const propCount = allForGame.length - lineMarkets.length;
  const detail: GameDetail = await getGameDetail(game?.id ?? "mock-game-001");

  if (!game) return <main className="panel p-4">No game found.</main>;

  return (
    <main className="grid gap-4">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold">
          {game.awayTeam} @ {game.homeTeam}
        </h2>
        <p className="text-sm text-slate-300">
          {new Date(game.startTime).toLocaleString()} - {game.status} - {game.weather}
        </p>
      </section>
      <section className="panel p-4">
        <h3 className="mb-2 text-lg">Game lines (quick view)</h3>
        <p className="mb-3 text-xs text-slate-500">
          Full player-prop board lives in Bet Builder — this page stays short on purpose.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {lineMarkets.slice(0, 12).map((m: Market) => (
            <div key={m.id} className="rounded bg-slate-900 p-3 text-sm">
              <div className="font-medium text-slate-200">
                {m.marketType} — {m.selection}
              </div>
              <div className="text-slate-400">{m.american > 0 ? `+${m.american}` : m.american}</div>
            </div>
          ))}
        </div>
        {propCount > 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            {propCount} player prop lines for this game — open Bet Builder to browse and simulate.
          </p>
        ) : null}
        <Link href={`/bet-builder?game=${game.id}`} className="btn-primary mt-4 inline-block">
          Open Bet Builder for this game
        </Link>
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4 text-sm">
          <h3 className="mb-2 font-semibold">Matchup Notes</h3>
          <p>{detail.matchup}</p>
          <p>{detail.venue}</p>
          <p>{detail.weather}</p>
          <h4 className="mt-3 font-semibold">Projected Starters</h4>
          {detail.starters.map((s) => (
            <p key={s} className="text-slate-300">
              {s}
            </p>
          ))}
          <h4 className="mt-3 font-semibold">Trends</h4>
          {detail.trends.map((t) => (
            <p key={t} className="text-slate-300">
              - {t}
            </p>
          ))}
        </div>
        <div className="panel p-4 text-sm">
          <h3 className="mb-2 font-semibold">Lineups / Players to Watch</h3>
          {Object.entries(detail.projectedLineups).map(([team, lineup]) => (
            <div key={team} className="mb-2">
              <p className="font-semibold">{team}</p>
              <p className="text-slate-300">{lineup.join(", ")}</p>
            </div>
          ))}
          <h4 className="mt-3 font-semibold">Player Focus</h4>
          {detail.playersToWatch.map((p) => (
            <p key={p.name} className="text-slate-300">
              {p.name} ({p.team}) - {p.opsOrEra}, {p.recentForm}
            </p>
          ))}
          <h4 className="mt-3 font-semibold">Injuries</h4>
          {detail.injuries.map((i) => (
            <p key={i} className="text-slate-300">
              {i}
            </p>
          ))}
        </div>
      </section>
      <Link href={`/bet-builder?game=${game.id}`} className="btn-muted w-fit text-sm">
        Bet Builder (same game)
      </Link>
    </main>
  );
}
