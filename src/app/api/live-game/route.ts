import { NextRequest, NextResponse } from "next/server";
import { fetchLiveGameState } from "@/lib/liveGame";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`live-game:${ip}`, 120, 60_000).allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }
  const gamePk = req.nextUrl.searchParams.get("gamePk");
  if (!gamePk) return NextResponse.json({ error: "gamePk required" }, { status: 400 });

  const live = await fetchLiveGameState(gamePk);
  if (!live) return NextResponse.json({ error: "Could not load game" }, { status: 404 });
  return NextResponse.json(live);
}
