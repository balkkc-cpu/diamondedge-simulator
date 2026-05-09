import { NextResponse } from "next/server";
import { getAllMarkets, getDailySchedule, getInjuries, getWeatherFallback } from "@/lib/apiClients";
import { mockGames } from "@/lib/mockData";
import { isPlayerPropMarketType, isSportsbookLineSource } from "@/lib/odds";
import { getOddsDebugState } from "@/lib/theOddsFanDuel";
import { getRundownDebugState } from "@/lib/theRundown";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`dashboard:${ip}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let games = await getDailySchedule();
  if (!games.length) games = mockGames;
  const [allMarkets, injuries, weather] = await Promise.all([
    getAllMarkets(),
    getInjuries(),
    getWeatherFallback()
  ]);

  const providerRaw = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
  const oddsProvider = providerRaw === "rundown" ? ("rundown" as const) : ("the_odds_api" as const);

  const slateIds = new Set(games.map((g) => g.id));
  const bookPlayerProps = allMarkets.filter((m) => isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source));
  const orphanBookPlayerProps = bookPlayerProps.filter((m) => !slateIds.has(m.gameId)).length;
  const byGame: Record<string, number> = {};
  for (const m of bookPlayerProps) {
    if (!slateIds.has(m.gameId)) continue;
    byGame[m.gameId] = (byGame[m.gameId] ?? 0) + 1;
  }

  return NextResponse.json(
    {
      games,
      allMarkets,
      injuries,
      weather,
      oddsProvider,
      oddsDebug: oddsProvider === "rundown" ? getRundownDebugState() : getOddsDebugState(),
      boardStats: {
        slateGames: games.length,
        markets: allMarkets.length,
        bookPlayerProps: bookPlayerProps.length,
        /** Sportsbook player rows whose `gameId` is not on today’s slate — usually event↔game mapping failure. */
        orphanBookPlayerProps,
        bookPlayerPropsByGameId: byGame
      }
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate"
      }
    }
  );
}
