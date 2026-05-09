import type { GameCard } from "./types";
import { slateDateStringEt } from "./sportContext";

type BdlTeam = { id?: number; full_name?: string; name?: string; abbreviation?: string };
type BdlGame = {
  id?: number;
  date?: string;
  datetime?: string;
  status?: string;
  home_team?: BdlTeam;
  visitor_team?: BdlTeam;
};

/**
 * Today’s NBA games via Balldontlie (no key on free tier for current-season dates).
 * Falls back to empty array on failure — callers merge with mock slate.
 */
export async function fetchNbaGamesForDateEt(dateYmd?: string): Promise<GameCard[]> {
  const d = dateYmd?.trim() || slateDateStringEt();
  const url = `https://api.balldontlie.io/v1/games?dates[]=${encodeURIComponent(d)}&per_page=100`;
  try {
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) return [];
    const payload = (await res.json()) as { data?: BdlGame[] };
    const rows = Array.isArray(payload?.data) ? payload.data : [];
    const out: GameCard[] = [];
    for (const g of rows) {
      const id = g?.id != null ? String(g.id) : "";
      if (!id) continue;
      const home = String(g.home_team?.full_name ?? g.home_team?.name ?? "Home").trim() || "Home";
      const away = String(g.visitor_team?.full_name ?? g.visitor_team?.name ?? "Away").trim() || "Away";
      const start = String(g.datetime ?? g.date ?? "").trim();
      const startTime = start && !start.endsWith("Z") && /T/.test(start) ? `${start}Z` : start || new Date().toISOString();
      out.push({
        id,
        startTime,
        status: String(g.status ?? "scheduled"),
        homeTeam: home,
        awayTeam: away,
        homeTeamId: g.home_team?.id,
        awayTeamId: g.visitor_team?.id,
        weather: "Indoor / arena",
        ballpark: "NBA arena",
        probablePitchers: "Starting lineups TBD",
        delayInfo: null
      });
    }
    return out;
  } catch {
    return [];
  }
}
