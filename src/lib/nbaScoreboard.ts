import type { GameCard } from "./types";
import { nbaCdnFetch } from "./nbaCdnFetch";

type NbaScoreboardGame = {
  gameId?: string;
  gameStatusText?: string;
  gameStatus?: number;
  period?: number;
  gameClock?: string;
  gameTimeUTC?: string;
  homeTeam?: {
    teamCity?: string;
    teamName?: string;
    teamTricode?: string;
    score?: number;
  };
  awayTeam?: {
    teamCity?: string;
    teamName?: string;
    teamTricode?: string;
    score?: number;
  };
};

/**
 * Today’s NBA slate from NBA.com live scoreboard (includes official `gameId` for play-by-play + box score).
 * `GameCard.id` is the 10-digit NBA stats game id (e.g. 0022400120).
 */
export async function fetchNbaScoreboardGameCards(): Promise<GameCard[]> {
  try {
    const res = await nbaCdnFetch("https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", {
      next: { revalidate: 120 }
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as { scoreboard?: { games?: NbaScoreboardGame[] } };
    const games = payload?.scoreboard?.games ?? [];
    const out: GameCard[] = [];
    for (const g of games) {
      const id = g?.gameId?.trim();
      if (!id || !/^\d{10}$/.test(id)) continue;
      const hc = String(g.homeTeam?.teamCity ?? "").trim();
      const hn = String(g.homeTeam?.teamName ?? "").trim();
      const ac = String(g.awayTeam?.teamCity ?? "").trim();
      const an = String(g.awayTeam?.teamName ?? "").trim();
      const homeTeam = [hc, hn].filter(Boolean).join(" ") || "Home";
      const awayTeam = [ac, an].filter(Boolean).join(" ") || "Away";
      const startTime = g.gameTimeUTC?.trim() ? (g.gameTimeUTC.endsWith("Z") ? g.gameTimeUTC : `${g.gameTimeUTC}Z`) : new Date().toISOString();
      const status = g.gameStatusText?.trim() || (g.gameStatus === 1 ? "Scheduled" : g.gameStatus === 2 ? "Live" : "Final");
      out.push({
        id,
        startTime,
        status,
        homeTeam,
        awayTeam,
        homeTeamId: undefined,
        awayTeamId: undefined,
        weather: "Indoor",
        ballpark: `${homeTeam} arena`,
        probablePitchers: "NBA.com live data",
        delayInfo: null
      });
    }
    return out;
  } catch {
    return [];
  }
}
