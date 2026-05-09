import { NextRequest, NextResponse } from "next/server";
import { fetchNbaLiveGameState } from "@/lib/nbaLiveGame";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`nba-live-game:${ip}`, 120, 60_000).allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  const gameId = req.nextUrl.searchParams.get("gameId")?.trim();
  if (!gameId || !/^\d{10}$/.test(gameId)) {
    return NextResponse.json({ error: "gameId must be a 10-digit NBA stats game id" }, { status: 400 });
  }

  const live = await fetchNbaLiveGameState(gameId);
  if (!live) return NextResponse.json({ error: "Could not load NBA game" }, { status: 404 });
  return NextResponse.json(live, {
    headers: { "Cache-Control": "private, no-store, max-age=0, must-revalidate" }
  });
}
