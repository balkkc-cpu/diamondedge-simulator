import { NextResponse } from "next/server";
import { getAllMarkets, getDailySchedule, getInjuries, getWeatherFallback } from "@/lib/apiClients";
import { getOddsDebugState } from "@/lib/theOddsFanDuel";
import { getRundownDebugState } from "@/lib/theRundown";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`dashboard:${ip}`, 120, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const games = await getDailySchedule();
  const [allMarkets, injuries, weather] = await Promise.all([
    getAllMarkets(),
    getInjuries(),
    getWeatherFallback()
  ]);

  const providerRaw = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
  const oddsProvider = providerRaw === "rundown" ? ("rundown" as const) : ("the_odds_api" as const);

  return NextResponse.json({
    games,
    allMarkets,
    injuries,
    weather,
    oddsProvider,
    oddsDebug: oddsProvider === "rundown" ? getRundownDebugState() : getOddsDebugState()
  });
}
