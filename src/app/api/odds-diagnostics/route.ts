import { NextResponse } from "next/server";
import { oddsApiRevalidateSeconds } from "@/lib/odds";

export const runtime = "nodejs";

const oddsFetchInit = { next: { revalidate: oddsApiRevalidateSeconds() } } as const;

export async function GET() {
  const key = process.env.ODDS_API_KEY?.trim();
  if (!key) return NextResponse.json({ ok: false, error: "ODDS_API_KEY missing" }, { status: 500 });

  const baseSports = `https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(key)}`;
  const sportsRes = await fetch(baseSports, oddsFetchInit);
  const sportsTxt = await sportsRes.text();
  let sports: Array<{ key?: string; active?: boolean }> = [];
  try {
    sports = JSON.parse(sportsTxt);
  } catch {}

  const baseballKeys = (sports ?? [])
    .filter((s) => String(s.key ?? "").includes("baseball_mlb"))
    .map((s) => ({ key: String(s.key ?? ""), active: s.active !== false }));

  const checks: Array<{
    key: string;
    eventsStatus: number;
    eventsCount: number;
    oddsStatus: number;
    oddsCount: number;
    sampleBody?: string;
  }> = [];

  for (const s of baseballKeys.slice(0, 6)) {
    const evUrl = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(s.key)}/events?apiKey=${encodeURIComponent(key)}`;
    const odUrl =
      `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(s.key)}/odds` +
      `?apiKey=${encodeURIComponent(key)}&regions=us&oddsFormat=american&markets=h2h,spreads,totals`;

    const [evRes, odRes] = await Promise.all([fetch(evUrl, oddsFetchInit), fetch(odUrl, oddsFetchInit)]);
    const evTxt = await evRes.text();
    const odTxt = await odRes.text();
    let evCount = 0;
    let odCount = 0;
    try {
      const j = JSON.parse(evTxt);
      if (Array.isArray(j)) evCount = j.length;
    } catch {}
    try {
      const j = JSON.parse(odTxt);
      if (Array.isArray(j)) odCount = j.length;
    } catch {}
    checks.push({
      key: s.key,
      eventsStatus: evRes.status,
      eventsCount: evCount,
      oddsStatus: odRes.status,
      oddsCount: odCount,
      sampleBody: odTxt.slice(0, 180).replace(/\s+/g, " ")
    });
  }

  return NextResponse.json({
    ok: true,
    sportsStatus: sportsRes.status,
    baseballKeys,
    checks
  });
}

