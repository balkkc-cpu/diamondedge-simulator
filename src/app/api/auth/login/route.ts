import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { applyUserSessionCookie, verifyPassword } from "@/lib/userAuth";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  if (!rateLimit(`login:${ip}`, 20, 60_000).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const body = await req.json();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  if (!user.emailVerified) return NextResponse.json({ error: "Verify email first" }, { status: 403 });
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  applyUserSessionCookie(res, user.email);
  return res;
}
