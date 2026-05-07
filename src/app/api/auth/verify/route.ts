import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyUserSessionCookie, hashToken } from "@/lib/userAuth";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const token = String(body.token ?? "");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });
  const tokenHash = hashToken(token);
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash } });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
  }
  const user = await prisma.user.findUnique({ where: { id: record.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  await prisma.verificationToken.delete({ where: { tokenHash } });
  const res = NextResponse.json({ ok: true });
  applyUserSessionCookie(res, user.email);
  return res;
}
