import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/sessionUser";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const row = await prisma.userSavedSimulation.findFirst({
    where: { id: params.id, userId: user.id }
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let payload: unknown;
  try {
    payload = JSON.parse(row.payloadJson) as unknown;
  } catch {
    payload = {};
  }
  return NextResponse.json({ title: row.title, createdAt: row.createdAt, payload });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await prisma.userSavedSimulation.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!r.count) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
