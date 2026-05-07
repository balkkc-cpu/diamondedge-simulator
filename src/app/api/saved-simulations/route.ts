import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

const MAX_PAYLOAD = 900_000;

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.userSavedSimulation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: { id: true, title: true, createdAt: true }
  });
  return NextResponse.json({ simulations: rows });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`saved-sim:${ip}`, 30, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.payload) return NextResponse.json({ error: "Missing payload" }, { status: 400 });
  const title = body.title != null ? String(body.title).slice(0, 100) : null;
  const raw = typeof body.payload === "string" ? body.payload : JSON.stringify(body.payload);
  if (raw.length > MAX_PAYLOAD) {
    return NextResponse.json({ error: "Simulation too large to save" }, { status: 400 });
  }

  const row = await prisma.userSavedSimulation.create({
    data: { userId: user.id, title, payloadJson: raw }
  });
  return NextResponse.json({ ok: true, id: row.id });
}
