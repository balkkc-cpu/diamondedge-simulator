import { NextResponse } from "next/server";
import { getAllMarkets, getDailyScheduleSport, getInjuriesSport, getWeatherFallback } from "@/lib/apiClients";
import { mockGames, mockNbaGames } from "@/lib/mockData";
import { isPlayerPropMarketType, isSportsbookLineSource } from "@/lib/odds";
import { getOddsDebugState } from "@/lib/theOddsFanDuel";
import { getRundownDebugState } from "@/lib/theRundown";
import { rateLimit } from "@/lib/rateLimit";
import { oddsProviderForSport, parseSportCode, type SportCode } from "@/lib/sportContext";
import type { GameCard, Market } from "@/lib/types";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`dashboard:${ip}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const sport: SportCode = parseSportCode(searchParams.get("sport"));
  const mockGamesFor = sport === "nba" ? mockNbaGames : mockGames;

  let games: GameCard[] = await getDailyScheduleSport(sport);
  if (!games.length) games = mockGamesFor;
  const [allMarkets, injuries, weather] = await Promise.all([
    getAllMarkets(sport),
    getInjuriesSport(sport),
    getWeatherFallback()
  ]);

  const providerRaw = oddsProviderForSport(sport);
  const oddsProvider = providerRaw === "rundown" ? ("rundown" as const) : ("the_odds_api" as const);

  const slateIds = new Set(games.map((g: GameCard) => g.id));
  const bookPlayerProps = allMarkets.filter(
    (m: Market) => isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source)
  );
  const orphanBookPlayerProps = bookPlayerProps.filter((m: Market) => !slateIds.has(m.gameId)).length;
  const byGame: Record<string, number> = {};
  for (const m of bookPlayerProps) {
    if (!slateIds.has(m.gameId)) continue;
    byGame[m.gameId] = (byGame[m.gameId] ?? 0) + 1;
  }

  return NextResponse.json(
    {
      sport,
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
