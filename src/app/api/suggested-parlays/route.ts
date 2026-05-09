import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { getAllMarkets, getDailyScheduleSport } from "@/lib/apiClients";
import { buildSuggestedParlaysFromBoard } from "@/lib/suggestedParlays";
import { parseSportCode, type SportCode } from "@/lib/sportContext";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`suggested-parlays:${ip}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const { searchParams } = new URL(req.url);
  const legsRaw = Number(searchParams.get("legs") ?? "3");
  const legs = (legsRaw === 2 || legsRaw === 3 || legsRaw === 4 ? legsRaw : 3) as 2 | 3 | 4;
  const sport: SportCode = parseSportCode(searchParams.get("sport"));

  const [games, markets] = await Promise.all([getDailyScheduleSport(sport), getAllMarkets(sport)]);
  const parlays = await buildSuggestedParlaysFromBoard({
    games,
    markets,
    parlayLegs: legs,
    diversitySeed: Date.now()
  });
  return NextResponse.json(
    { parlays },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0, must-revalidate"
      }
    }
  );
}

