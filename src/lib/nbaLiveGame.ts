/** Normalized NBA live state from NBA.com CDN (boxscore + play-by-play). */

import { nbaCdnFetch } from "./nbaCdnFetch";

export type NbaShotMarker = {
  actionNumber: number;
  period: number;
  clock: string;
  /** NBA court percentage coordinates (0–100), when present */
  xPct: number | null;
  yPct: number | null;
  xLegacy: number | null;
  yLegacy: number | null;
  made: boolean;
  actionType: string;
  subType: string;
  descriptor?: string;
  shotDistanceFt?: number;
  area?: string;
  playerNameI?: string;
  teamTricode?: string;
  assistNameI?: string;
  description: string;
};

export type NbaReboundEvent = {
  actionNumber: number;
  period: number;
  clock: string;
  playerNameI?: string;
  teamTricode?: string;
  subType: string;
  description: string;
};

export type NbaPlayerLiveRow = {
  personId: number;
  nameI: string;
  jerseyNum?: string;
  position?: string;
  oncourt?: boolean;
  minutes?: string;
  points: number;
  rebounds: number;
  assists: number;
  fgm: number;
  fga: number;
  threePm: number;
  threePa: number;
  fta: number;
  ftm: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  plusMinus?: number;
};

export type NbaLiveGamePayload = {
  gameId: string;
  homeTeam: string;
  awayTeam: string;
  homeTricode?: string;
  awayTricode?: string;
  homeScore: number;
  awayScore: number;
  period: number;
  gameClock: string;
  gameClockDisplay: string;
  gameStatusText: string;
  gameStatus: number;
  shots: NbaShotMarker[];
  rebounds: NbaReboundEvent[];
  assists: Array<{ actionNumber: number; text: string }>;
  homePlayers: NbaPlayerLiveRow[];
  awayPlayers: NbaPlayerLiveRow[];
  lastPlayDescription?: string;
  fetchedAt: string;
};

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v !== null && typeof v === "object") return v as Record<string, unknown>;
  return undefined;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Parse `PT07M36.00S` → `7:36` (game clock or minutes played). */
export function nbaClockToDisplay(clock: string): string {
  const s = String(clock ?? "").trim();
  const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/i);
  if (!m) return s || "—";
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const secRaw = m[3] ? parseFloat(m[3]) : 0;
  const seconds = Math.floor(secRaw);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Same as `nbaClockToDisplay` — ISO-8601 duration from box score. */
export const formatNbaMinutes = nbaClockToDisplay;

function periodLabel(period: number): string {
  if (period <= 4) return `Q${period}`;
  return `OT${period - 4}`;
}

function minutesRankSeconds(raw?: string): number {
  const s = String(raw ?? "");
  const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/i);
  if (!m) return 0;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = (m[2] ? parseInt(m[2], 10) : 0) + h * 60;
  const sec = m[3] ? parseFloat(m[3]) : 0;
  return min * 60 + sec;
}

function buildGameClockDisplay(periodRaw: number, gameClock: string, gameStatus: number, gameStatusText: string): string {
  const st = gameStatusText.trim();
  if (gameStatus === 3) return /^final/i.test(st) ? st : st || "Final";
  if (/half\s*time|halftime/i.test(st)) return st;
  if (!String(gameClock).trim()) return st || (periodRaw > 0 ? periodLabel(periodRaw) : "Pre tip");
  return `${periodLabel(periodRaw > 0 ? periodRaw : 1)} · ${nbaClockToDisplay(gameClock)}`;
}

/** e.g. "(T. Hardaway Jr. 1 AST)" */
function parseAssistNameFromDescription(desc: string): string | undefined {
  const m = desc.match(/\(\s*([^()]+?)\s+\d+\s+AST\s*\)/i);
  if (!m) return undefined;
  const name = m[1]?.trim();
  return name || undefined;
}

function inferMadeFieldGoal(shotResultRaw: unknown, description: string): boolean {
  const sr = String(shotResultRaw ?? "").trim().toLowerCase();
  if (sr === "made") return true;
  if (sr === "missed") return false;
  const d = description.trim();
  if (/^miss\b/i.test(d)) return false;
  if (/\(\s*\d+\s*PTS\s*\)/.test(d)) return true;
  return false;
}

function parseShotsAndEvents(actions: unknown[]): {
  shots: NbaShotMarker[];
  rebounds: NbaReboundEvent[];
  assists: Array<{ actionNumber: number; text: string }>;
  lastPlay?: string;
} {
  const shots: NbaShotMarker[] = [];
  const rebounds: NbaReboundEvent[] = [];
  const assists: Array<{ actionNumber: number; text: string }> = [];
  let lastPlay: string | undefined;

  if (!Array.isArray(actions)) return { shots, rebounds, assists, lastPlay };

  for (const raw of actions) {
    const a = asRecord(raw);
    if (!a) continue;
    const actionNumber = num(a.actionNumber);
    const period = num(a.period);
    const clock = String(a.clock ?? "");
    const desc = String(a.description ?? "").trim();
    if (desc) lastPlay = desc;

    const actionType = String(a.actionType ?? "").toLowerCase();
    if (actionType === "rebound") {
      rebounds.push({
        actionNumber,
        period,
        clock,
        playerNameI: a.playerNameI as string | undefined,
        teamTricode: a.teamTricode as string | undefined,
        subType: String(a.subType ?? ""),
        description: desc
      });
    }

    if (num(a.isFieldGoal) === 1) {
      const xRaw = a.x;
      const yRaw = a.y;
      const xPct = typeof xRaw === "number" && Number.isFinite(xRaw) ? xRaw : null;
      const yPct = typeof yRaw === "number" && Number.isFinite(yRaw) ? yRaw : null;
      const xl = a.xLegacy;
      const yl = a.yLegacy;
      const made = inferMadeFieldGoal(a.shotResult, desc);
      let assistNameI = a.assistPlayerNameInitial as string | undefined;
      if (made && !assistNameI) assistNameI = parseAssistNameFromDescription(desc);
      if (made && assistNameI) {
        assists.push({
          actionNumber,
          text: `${assistNameI} → ${String(a.playerNameI ?? "Shooter")} (${String(a.actionType ?? "").toUpperCase()}${a.subType ? ` ${a.subType}` : ""})`
        });
      }
      shots.push({
        actionNumber,
        period,
        clock,
        xPct,
        yPct,
        xLegacy: typeof xl === "number" ? xl : null,
        yLegacy: typeof yl === "number" ? yl : null,
        made,
        actionType: String(a.actionType ?? ""),
        subType: String(a.subType ?? ""),
        descriptor: a.descriptor as string | undefined,
        shotDistanceFt: typeof a.shotDistance === "number" ? a.shotDistance : undefined,
        area: a.area as string | undefined,
        playerNameI: a.playerNameI as string | undefined,
        teamTricode: a.teamTricode as string | undefined,
        assistNameI,
        description: desc
      });
    }
  }

  return {
    shots: shots.slice(-80),
    rebounds: rebounds.slice(-24),
    assists: assists.slice(-20),
    lastPlay
  };
}

function mapPlayers(team: Record<string, unknown> | undefined): NbaPlayerLiveRow[] {
  const players = team?.players as unknown[] | undefined;
  if (!Array.isArray(players)) return [];
  const rows: NbaPlayerLiveRow[] = [];
  for (const p of players) {
    const o = asRecord(p);
    if (!o) continue;
    const st = asRecord(o.statistics) ?? {};
    const personId = num(o.personId);
    if (!personId) continue;
    const hasPlayed = String(o.played) === "1";
    const isStarter = String(o.starter) === "1";
    if (!hasPlayed && !isStarter) continue;
    const minutesRaw =
      st.minutesCalculated != null ? String(st.minutesCalculated) : st.minutes != null ? String(st.minutes) : undefined;
    rows.push({
      personId,
      nameI: String(o.nameI ?? o.name ?? "Player"),
      jerseyNum: o.jerseyNum != null ? String(o.jerseyNum) : undefined,
      position: o.position as string | undefined,
      oncourt: o.oncourt === "1" || o.oncourt === 1,
      minutes: minutesRaw,
      points: num(st.points),
      rebounds: num(st.reboundsTotal),
      assists: num(st.assists),
      fgm: num(st.fieldGoalsMade),
      fga: num(st.fieldGoalsAttempted),
      threePm: num(st.threePointersMade),
      threePa: num(st.threePointersAttempted),
      ftm: num(st.freeThrowsMade),
      fta: num(st.freeThrowsAttempted),
      steals: num(st.steals),
      blocks: num(st.blocks),
      turnovers: num(st.turnovers),
      fouls: num(st.foulsPersonal),
      plusMinus: st.plusMinusPoints != null ? num(st.plusMinusPoints) : undefined
    });
  }
  rows.sort((a, b) => {
    if (a.oncourt !== b.oncourt) return a.oncourt ? -1 : 1;
    const ma = minutesRankSeconds(a.minutes);
    const mb = minutesRankSeconds(b.minutes);
    if (Math.abs(ma - mb) > 0.5) return mb - ma;
    if (b.points !== a.points) return b.points - a.points;
    return b.rebounds - a.rebounds;
  });
  return rows;
}

export async function fetchNbaLiveGameState(gameId: string): Promise<NbaLiveGamePayload | null> {
  const id = String(gameId ?? "").trim();
  if (!/^\d{10}$/.test(id)) return null;

  try {
    const [pbpRes, boxRes] = await Promise.all([
      nbaCdnFetch(`https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${id}.json`, { cache: "no-store" }),
      nbaCdnFetch(`https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${id}.json`, { cache: "no-store" })
    ]);
    if (!boxRes.ok) return null;
    const boxJson = (await boxRes.json()) as Record<string, unknown>;
    const game = asRecord(boxJson.game);
    if (!game) return null;

    const home = asRecord(game.homeTeam);
    const away = asRecord(game.awayTeam);
    const homeCity = String(home?.teamCity ?? "");
    const homeName = String(home?.teamName ?? "");
    const awayCity = String(away?.teamCity ?? "");
    const awayName = String(away?.teamName ?? "");
    const homeTeam = [homeCity, homeName].filter(Boolean).join(" ") || "Home";
    const awayTeam = [awayCity, awayName].filter(Boolean).join(" ") || "Away";

    let actions: unknown[] = [];
    if (pbpRes.ok) {
      const pbpJson = (await pbpRes.json()) as Record<string, unknown>;
      const g2 = asRecord(pbpJson.game);
      const raw = g2?.actions;
      if (Array.isArray(raw)) actions = raw;
    }

    const { shots, rebounds, assists, lastPlay } = parseShotsAndEvents(actions);

    const gameClock = String(game.gameClock ?? "");
    const periodRaw = num(game.period);
    const gameStatus = num(game.gameStatus);
    const gameStatusText = String(game.gameStatusText ?? "");
    const clockDisplay = buildGameClockDisplay(periodRaw, gameClock, gameStatus, gameStatusText);

    return {
      gameId: id,
      homeTeam,
      awayTeam,
      homeTricode: home?.teamTricode as string | undefined,
      awayTricode: away?.teamTricode as string | undefined,
      homeScore: num(home?.score),
      awayScore: num(away?.score),
      period: periodRaw > 0 ? periodRaw : 1,
      gameClock,
      gameClockDisplay: clockDisplay,
      gameStatusText,
      gameStatus,
      shots,
      rebounds,
      assists,
      homePlayers: mapPlayers(home),
      awayPlayers: mapPlayers(away),
      lastPlayDescription: lastPlay,
      fetchedAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
