import type { SlipBet } from "./types";

export type GameHistoryContext = {
  gameId: string;
  homeTeam?: string;
  awayTeam?: string;
  meetingsSample: number;
  homeWins: number;
  awayWins: number;
  avgTotalRuns: number;
  lastMeeting?: string;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function safeJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function buildGameHistoryContext(bets: SlipBet[]): Promise<Record<string, GameHistoryContext>> {
  const out: Record<string, GameHistoryContext> = {};
  const ids = [...new Set(bets.map((b) => b.gameId).filter((x) => /^\d+$/.test(x)))];
  for (const gid of ids) {
    try {
      const feed = await safeJson(`https://statsapi.mlb.com/api/v1.1/game/${gid}/feed/live`);
      const home = String(feed?.gameData?.teams?.home?.name ?? "");
      const away = String(feed?.gameData?.teams?.away?.name ?? "");
      const homeId = Number(feed?.gameData?.teams?.home?.id ?? 0);
      const awayId = Number(feed?.gameData?.teams?.away?.id ?? 0);
      if (!homeId || !awayId) continue;

      const end = new Date();
      const start = new Date(Date.now() - 1000 * 60 * 60 * 24 * 365);
      const sched = await safeJson(
        `https://statsapi.mlb.com/api/v1/schedule?sportId=1&teamId=${homeId}&startDate=${ymd(start)}&endDate=${ymd(end)}`
      );
      const games: any[] = [];
      for (const d of sched?.dates ?? []) for (const g of d.games ?? []) games.push(g);
      const h2h = games.filter((g) => {
        const hid = Number(g?.teams?.home?.team?.id ?? 0);
        const aid = Number(g?.teams?.away?.team?.id ?? 0);
        return (hid === homeId && aid === awayId) || (hid === awayId && aid === homeId);
      });

      let homeWins = 0;
      let awayWins = 0;
      let runSum = 0;
      let n = 0;
      for (const g of h2h.slice(-12)) {
        const hs = Number(g?.teams?.home?.score ?? NaN);
        const as = Number(g?.teams?.away?.score ?? NaN);
        if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
        n += 1;
        runSum += hs + as;
        const hid = Number(g?.teams?.home?.team?.id ?? 0);
        if (hs > as) {
          if (hid === homeId) homeWins += 1;
          else awayWins += 1;
        } else if (as > hs) {
          if (hid === homeId) awayWins += 1;
          else homeWins += 1;
        }
      }

      out[gid] = {
        gameId: gid,
        homeTeam: home || undefined,
        awayTeam: away || undefined,
        meetingsSample: n,
        homeWins,
        awayWins,
        avgTotalRuns: n ? runSum / n : 0,
        lastMeeting: h2h.length ? String(h2h[h2h.length - 1]?.gameDate ?? "").slice(0, 10) : undefined
      };
    } catch {
      // ignore
    }
  }
  return out;
}

