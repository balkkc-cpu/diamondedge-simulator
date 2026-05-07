import { NextRequest, NextResponse } from "next/server";
import { runSimulation1000 } from "@/lib/simEngine";
import { SlipBet } from "@/lib/types";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`simulate:${ip}`, 30, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  const body = await req.json();
  const bets = (body.bets ?? []) as SlipBet[];
  const bankroll = Number(body.bankroll ?? 1000);
  const unitSize = Number(body.unitSize ?? 25);
  if (!Number.isFinite(bankroll) || !Number.isFinite(unitSize)) {
    return NextResponse.json({ error: "Invalid bankroll or unit size" }, { status: 400 });
  }
  if (bankroll < 0 || unitSize < 0) {
    return NextResponse.json({ error: "Values must be non-negative" }, { status: 400 });
  }
  if (bets.length > 25) {
    return NextResponse.json({ error: "Max 25 selections per request" }, { status: 400 });
  }
  if (!bets.length) return NextResponse.json({ error: "No bets selected" }, { status: 400 });

  const simulation = runSimulation1000(bets, { iterations: 1000 });

  return NextResponse.json({
    ...simulation,
    bankroll,
    unitSize,
    disclaimer: "Simulation estimates only. No outcome is guaranteed."
  });
}
