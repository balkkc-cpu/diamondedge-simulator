import { NextResponse } from "next/server";
import { getDailyPicksPayload } from "@/lib/dailyPicks";
import { rateLimit } from "@/lib/rateLimit";

export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`daily-picks:${ip}`, 60, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const payload = await getDailyPicksPayload();
  return NextResponse.json(payload);
}
