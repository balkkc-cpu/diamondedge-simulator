import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.userSavedSlip.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, name: true, bankroll: true, unitSize: true, createdAt: true, updatedAt: true }
  });
  return NextResponse.json({ slips: rows });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`saved-slip:${ip}`, 40, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const bets = body.bets;
  const bankroll = Number(body.bankroll ?? 1000);
  const unitSize = Number(body.unitSize ?? 25);
  const name = body.name != null ? String(body.name).slice(0, 80) : null;
  if (!Array.isArray(bets) || bets.length > 40) {
    return NextResponse.json({ error: "Invalid bets array" }, { status: 400 });
  }

  const row = await prisma.userSavedSlip.create({
    data: {
      userId: user.id,
      name,
      bankroll,
      unitSize,
      betsJson: JSON.stringify(bets)
    }
  });
  return NextResponse.json({ ok: true, slip: { id: row.id, name: row.name, updatedAt: row.updatedAt } });
}
