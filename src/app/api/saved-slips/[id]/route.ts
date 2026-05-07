import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const slip = await prisma.userSavedSlip.findFirst({
    where: { id: params.id, userId: user.id }
  });
  if (!slip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let bets: unknown[] = [];
  try {
    bets = JSON.parse(slip.betsJson) as unknown[];
  } catch {
    bets = [];
  }
  return NextResponse.json({
    slip: {
      id: slip.id,
      name: slip.name,
      bankroll: slip.bankroll,
      unitSize: slip.unitSize,
      bets,
      updatedAt: slip.updatedAt
    }
  });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await prisma.userSavedSlip.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
