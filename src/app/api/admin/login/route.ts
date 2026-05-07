import { NextRequest, NextResponse } from "next/server";
import { isValidOwnerCredential, setAdminSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "local";
  const rl = rateLimit(`admin-login:${ip}`, 10, 60_000);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const body = await req.json();
  const username = String(body.username ?? "").trim();
  const password = String(body.password ?? "");

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  if (!isValidOwnerCredential(username, password)) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  setAdminSession(username);
  return NextResponse.json({ ok: true });
}
