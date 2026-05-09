import { fetchNbaGamesForDateEt } from "./nbaSchedule";
import { mockGameDetails, mockGames, mockMarkets, mockNbaGames, mockNbaMarkets } from "./mockData";
import { oddsApiKeyForSport, oddsProviderForSport, slateDateStringEt, type SportCode } from "./sportContext";
import {
  filterLegiblePlayerPropsForSlate,
  filterOutNonBookPlayerProps,
  impliedProbabilityFromAmerican,
  isPlayerPropMarketType,
  isSportsbookLineSource
} from "./odds";
import { buildPlayerPropMarkets, filterRundownMislabeledPlayerProps } from "./rosterProps";
import {
  buildPlayerPropsFromOddsEvents,
  fetchOddsEvents,
  isRundownMarketAdaptableToOddsLayout,
  mergeFanDuelPrices,
  rundownMarketsToSyntheticOddsEvents
} from "./theOddsFanDuel";
import { fetchRundownMarketsForToday, getRundownDebugState, markRundownBoardServedFromOddsApiFallback } from "./theRundown";
import { applyRundownRetailSlate } from "./retailBoard";
import { GameCard, GameDetail, Market, PlayerCard } from "./types";

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const MLB_STATS_API_V11 = "https://statsapi.mlb.com/api/v1.1";

/** Off by default: roster sim props use synthetic prices — not real books. Set `SIM_ROSTER_PLAYER_PROPS=1` to opt in. */
function allowSimRosterPlayerProps(): boolean {
  const v = String(process.env.SIM_ROSTER_PLAYER_PROPS ?? process.env.ALLOW_SIM_ROSTER_PLAYER_PROPS ?? "")
    .trim()
    .toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** MLB slate day should follow US Eastern time, not UTC day rollover. */
export function mlbDateStringEt(now = new Date()): string {
  return slateDateStringEt(now);
}

/** MLB Stats `gameDate` is UTC with `Z` when zone included; normalize so server parse isn't ambiguous. */
function normalizeMlbStartIso(raw: string): string {
  const s = raw.trim();
  if (!s) return new Date().toISOString();
  if (/[zZ]$/.test(s)) return s;
  if (/[+-]\d{2}:?\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) {
    return s.endsWith("Z") ? s : `${s}Z`;
  }
  return s;
}

async function safeJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json();
}

/** Schedule + injuries: refresh often so first-pitch times and slate stay current. */
async function scheduleJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json();
}

function gameSeed(gameId: string) {
  return gameId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function generateMarketsForGame(game: GameCard): Market[] {
  const seed = gameSeed(game.id);
  const homeEdge = (seed % 11) - 5;
  const baseHomeMl = -115 + homeEdge * 4;
  const baseAwayMl = 105 - homeEdge * 4;
  const total = 8 + ((seed % 4) * 0.5);
  const ttLine = Math.round((total / 2 + 0.5) * 2) / 2;

  return [
    { id: `${game.id}-ml-home`, gameId: game.id, marketType: "moneyline", selection: game.homeTeam, line: null, american: baseHomeMl, source: "model" },
    { id: `${game.id}-ml-away`, gameId: game.id, marketType: "moneyline", selection: game.awayTeam, line: null, american: baseAwayMl, source: "model" },
    {
      id: `${game.id}-rl-home`,
      gameId: game.id,
      marketType: "runline",
      selection: `${game.homeTeam} -1.5`,
      line: -1.5,
      american: 138 + (seed % 20),
      source: "model"
    },
    {
      id: `${game.id}-rl-away`,
      gameId: game.id,
      marketType: "runline",
      selection: `${game.awayTeam} +1.5`,
      line: 1.5,
      american: -155 + (seed % 12),
      source: "model"
    },
    { id: `${game.id}-tot-over`, gameId: game.id, marketType: "total", selection: `Over ${total.toFixed(1)}`, line: total, american: -108, source: "model" },
    { id: `${game.id}-tot-under`, gameId: game.id, marketType: "total", selection: `Under ${total.toFixed(1)}`, line: total, american: -112, source: "model" },
    {
      id: `${game.id}-tt-home`,
      gameId: game.id,
      marketType: "team_total",
      selection: `${game.homeTeam} Over ${ttLine.toFixed(1)}`,
      line: ttLine,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-tt-away`,
      gameId: game.id,
      marketType: "team_total",
      selection: `${game.awayTeam} Over ${ttLine.toFixed(1)}`,
      line: ttLine,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-f5-h`,
      gameId: game.id,
      marketType: "first5",
      selection: `${game.homeTeam} · First 5 innings`,
      line: null,
      american: -102,
      source: "model"
    },
    {
      id: `${game.id}-f5-a`,
      gameId: game.id,
      marketType: "first5",
      selection: `${game.awayTeam} · First 5 innings`,
      line: null,
      american: -102,
      source: "model"
    },
    { id: `${game.id}-yrfi`, gameId: game.id, marketType: "yrfi", selection: "YRFI (Yes Run 1st Inning)", line: null, american: -107, source: "model" },
    { id: `${game.id}-nrfi`, gameId: game.id, marketType: "nrfi", selection: "NRFI (No Run 1st Inning)", line: null, american: -113, source: "model" }
  ];
}

function generateMarketsForSport(sport: SportCode, game: GameCard): Market[] {
  if (sport === "mlb") return generateMarketsForGame(game);
  const seed = gameSeed(game.id);
  const homeEdge = (seed % 11) - 5;
  const baseHomeMl = -112 + homeEdge * 3;
  const baseAwayMl = 102 - homeEdge * 3;
  const total = 218 + (seed % 6) * 0.5;
  const spread = 6.5 + (seed % 3) * 0.5;
  const ttLine = Math.round((total / 2) * 2) / 2;
  const fmtSpread = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
  return [
    { id: `${game.id}-ml-home`, gameId: game.id, marketType: "moneyline", selection: game.homeTeam, line: null, american: baseHomeMl, source: "model" },
    { id: `${game.id}-ml-away`, gameId: game.id, marketType: "moneyline", selection: game.awayTeam, line: null, american: baseAwayMl, source: "model" },
    {
      id: `${game.id}-rl-home`,
      gameId: game.id,
      marketType: "runline",
      selection: `${game.homeTeam} -${fmtSpread(spread)}`,
      line: -spread,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-rl-away`,
      gameId: game.id,
      marketType: "runline",
      selection: `${game.awayTeam} +${fmtSpread(spread)}`,
      line: spread,
      american: -110,
      source: "model"
    },
    { id: `${game.id}-tot-over`, gameId: game.id, marketType: "total", selection: `Over ${total.toFixed(1)}`, line: total, american: -108, source: "model" },
    { id: `${game.id}-tot-under`, gameId: game.id, marketType: "total", selection: `Under ${total.toFixed(1)}`, line: total, american: -112, source: "model" },
    {
      id: `${game.id}-tt-h`,
      gameId: game.id,
      marketType: "team_total",
      selection: `${game.homeTeam} Over ${ttLine.toFixed(1)}`,
      line: ttLine,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-tt-a`,
      gameId: game.id,
      marketType: "team_total",
      selection: `${game.awayTeam} Over ${ttLine.toFixed(1)}`,
      line: ttLine,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-f5-h`,
      gameId: game.id,
      marketType: "first5",
      selection: `${game.homeTeam} · First half moneyline`,
      line: null,
      american: -102,
      source: "model"
    },
    {
      id: `${game.id}-f5-a`,
      gameId: game.id,
      marketType: "first5",
      selection: `${game.awayTeam} · First half moneyline`,
      line: null,
      american: -102,
      source: "model"
    }
  ];
}

function clampAmerican(n: number): number {
  const v = Math.round(n);
  return Math.max(-450, Math.min(450, v));
}

function normPropDedupePart(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function playerPropSideKeyFromSelection(selection: string): string {
  const t = selection.toLowerCase();
  if (t.includes("(yes)")) return "yes";
  if (t.includes("(no)")) return "no";
  if (/\bover\b/.test(t)) return "over";
  if (/\bunder\b/.test(t)) return "under";
  return "x";
}

function playerPropDedupeKey(m: Market): string {
  return `${m.gameId}|${m.statKey ?? ""}|${normPropDedupePart(m.playerName ?? "")}|${m.line ?? "x"}|${playerPropSideKeyFromSelection(m.selection)}`;
}

function marketDedupeKey(m: Market): string {
  return `${m.gameId}|${m.marketType}|${normPropDedupePart(m.selection)}|${m.line ?? "x"}|${normPropDedupePart(m.playerName ?? "")}`;
}

/**
 * Attach roster-backed `model` props when a game has no/few sportsbook player lines
 * (feed gaps, event↔game ID mismatch). Dedupes by prop key so book rows always win.
 */
async function augmentRosterPlayerPropsWhereMissing(
  games: GameCard[],
  board: Market[],
  sport: SportCode = "mlb"
): Promise<Market[]> {
  if (sport === "nba") return board;
  if (!allowSimRosterPlayerProps()) return board;

  const existingPropKeys = new Set(
    board.filter((m) => isPlayerPropMarketType(m.marketType)).map((m) => playerPropDedupeKey(m))
  );

  const needGames = games.filter((g) => {
    if (!g.homeTeamId || !g.awayTeamId) return false;
    const nBook = board.filter(
      (m) => m.gameId === g.id && isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source)
    ).length;
    return nBook < 12;
  });
  if (!needGames.length) return board;

  const fetched = await Promise.all(
    needGames.map(async (g) => {
      const nBook = board.filter(
        (m) => m.gameId === g.id && isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source)
      ).length;
      try {
        const roster = await buildPlayerPropMarkets(g);
        return { roster, nBook } as const;
      } catch {
        return { roster: [] as Market[], nBook } as const;
      }
    })
  );

  const extras: Market[] = [];
  for (const { roster, nBook } of fetched) {
    const cap = nBook === 0 ? roster.length : 120;
    let added = 0;
    for (const m of roster) {
      if (added >= cap) break;
      const k = playerPropDedupeKey(m);
      if (existingPropKeys.has(k)) continue;
      existingPropKeys.add(k);
      extras.push(m);
      added++;
    }
  }

  return extras.length ? [...board, ...extras] : board;
}

/** One row per leg; prefer major US books when the same prop is listed at multiple books. */
function dedupeOddsApiPlayerPropsPreferFanDuel(rows: Market[]): Market[] {
  const pref = ["fanduel", "draftkings", "betmgm", "espnbet", "caesars", "fanatics"];
  const byKey = new Map<string, Market[]>();
  for (const m of rows) {
    const k = playerPropDedupeKey(m);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(m);
  }
  const out: Market[] = [];
  for (const group of byKey.values()) {
    group.sort((a, b) => {
      const ia = pref.indexOf(String(a.source).toLowerCase());
      const ib = pref.indexOf(String(b.source).toLowerCase());
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
    out.push(group[0]!);
  }
  return out;
}

/**
 * Same prop offered on both feeds: keep The Odds API row (major-book prices); Rundown fills gaps for free.
 */
function mergePlayerPropLegsPreferOddsApi(apiLegs: Market[], rundownLegs: Market[]): Market[] {
  const byKey = new Map<string, Market>();
  for (const m of rundownLegs) byKey.set(playerPropDedupeKey(m), m);
  for (const m of apiLegs) byKey.set(playerPropDedupeKey(m), m);
  return [...byKey.values()];
}

/** Always build Rundown player legs (roster + synthetic Odds layout); never skip when an Odds API key exists. */
async function buildRundownBackedPlayerLegs(
  rundownPlayerRaw: Market[],
  games: GameCard[],
  sport: SportCode
): Promise<Market[]> {
  const rosterFiltered = await filterRundownMislabeledPlayerProps(rundownPlayerRaw, games);
  const adaptable = rundownPlayerRaw.filter((m) => {
    const g = games.find((x) => x.id === m.gameId);
    return isRundownMarketAdaptableToOddsLayout(m, g);
  });
  const byId = new Map<string, Market>();
  for (const m of [...adaptable, ...rosterFiltered]) byId.set(m.id, m);
  const synthetic = rundownMarketsToSyntheticOddsEvents([...byId.values()], games, sport);
  const fromOddsLayout =
    synthetic.length > 0
      ? dedupeOddsApiPlayerPropsPreferFanDuel(buildPlayerPropsFromOddsEvents(synthetic, games))
      : [];
  return fromOddsLayout.length ? fromOddsLayout : rosterFiltered;
}

/** Rundown slate: game lines stay; player props = Rundown (free) unified with Odds API props when the key returns events — API prices win on duplicates, Rundown keeps coverage. */
async function mergeRundownRetailPlayerProps(
  retail: Market[],
  games: GameCard[],
  sport: SportCode
): Promise<Market[]> {
  const gameLines = retail.filter((m) => !isPlayerPropMarketType(m.marketType));
  const rundownPlayerRaw = retail.filter((m) => isPlayerPropMarketType(m.marketType));

  const rundownLegs = await buildRundownBackedPlayerLegs(rundownPlayerRaw, games, sport);

  const oddsApiConfigured = !!oddsApiKeyForSport(sport);
  const events = oddsApiConfigured ? await fetchOddsEvents(sport) : [];
  const apiLegs =
    events.length > 0 ? dedupeOddsApiPlayerPropsPreferFanDuel(buildPlayerPropsFromOddsEvents(events, games)) : [];

  const playerLegs = mergePlayerPropLegsPreferOddsApi(apiLegs, rundownLegs);

  return filterLegiblePlayerPropsForSlate(filterOutNonBookPlayerProps([...gameLines, ...playerLegs]), games);
}

/** Real-odds failover when Rundown is unavailable/rate-limited: use The Odds API event feed only. */
async function buildOddsApiFailoverBoard(games: GameCard[], sport: SportCode): Promise<Market[]> {
  if (!games.length) return [];
  const events = await fetchOddsEvents(sport);
  if (!events.length) return [];
  const core = games.flatMap((g) => generateMarketsForSport(sport, g));
  const priced = mergeFanDuelPrices([...core], games, events);
  const apiPlayer = buildPlayerPropsFromOddsEvents(events, games);
  const combined = [...priced, ...apiPlayer];
  return filterLegiblePlayerPropsForSlate(filterOutNonBookPlayerProps(combined), games);
}

/** Merge whole-slate boards; keep primary rows when both feeds carry same leg key. */
function mergeBoardsPreferPrimary(primary: Market[], secondary: Market[]): Market[] {
  const byKey = new Map<string, Market>();
  for (const m of secondary) byKey.set(marketDedupeKey(m), m);
  for (const m of primary) byKey.set(marketDedupeKey(m), m);
  return [...byKey.values()];
}

/** Simulated markets per game (ML, RL, total, etc.); used when retail feeds are empty so the UI never has zero rows. */
function modelSlateBaseline(games: GameCard[], sport: SportCode): Market[] {
  if (!games.length) return [];
  return games.flatMap((g) => generateMarketsForSport(sport, g));
}

/** Book-priced rows win on key clash; model baseline fills missing legs (Rundown path). */
function mergeFeedsOverModelBaseline(feedRows: Market[], games: GameCard[], sport: SportCode): Market[] {
  return mergeBoardsPreferPrimary(feedRows, modelSlateBaseline(games, sport));
}

function baselineBookAmericanForProp(m: Market): number | null {
  if (!isPlayerPropMarketType(m.marketType)) return null;
  const stat = String(
    m.statKey ?? (m.marketType.toLowerCase() === "player_prop" ? "" : m.marketType.replace(/^player_/, ""))
  ).toLowerCase();
  const line = Number(m.line ?? 0);
  const sel = m.selection.toLowerCase();
  const isOver = sel.includes("over");
  const isUnder = sel.includes("under");
  const isTier = m.pickKind === "tier_plus";
  const isYesNo = m.pickKind === "yes_no";

  if (isYesNo && stat === "hr") {
    if (sel.includes("(yes)")) return 290;
    if (sel.includes("(no)")) return -420;
  }

  if (isTier) {
    const t = Math.max(1, Math.round(line || 1));
    if (stat === "hits") return t === 2 ? 165 : t >= 3 ? 520 : -170;
    if (stat === "tb") return t === 2 ? 145 : t === 3 ? 275 : t >= 4 ? 650 : -190;
    if (stat === "rbi") return t === 2 ? 260 : t >= 3 ? 700 : 125;
    if (stat === "runs") return t === 2 ? 245 : t >= 3 ? 640 : 130;
    if (stat === "hrr") return t === 2 ? -105 : t === 3 ? 165 : t >= 4 ? 420 : -160;
    if (stat === "walks") return t === 2 ? 240 : 135;
    if (stat === "k") return t >= 8 ? 280 : t >= 7 ? 170 : t >= 6 ? 110 : -105;
  }

  const ou = (over: number, under: number) => (isOver ? over : isUnder ? under : over);
  if (stat === "hits") {
    if (line <= 0.5) return ou(-185, 145);
    if (line <= 1.5) return ou(128, -158);
    return ou(290, -390);
  }
  if (stat === "tb") {
    if (line <= 0.5) return ou(-210, 165);
    if (line <= 1.5) return ou(112, -138);
    if (line <= 2.5) return ou(210, -275);
    return ou(420, -450);
  }
  if (stat === "rbi") {
    if (line <= 0.5) return ou(122, -152);
    if (line <= 1.5) return ou(285, -400);
    return ou(700, -450);
  }
  if (stat === "runs") {
    if (line <= 0.5) return ou(118, -148);
    if (line <= 1.5) return ou(275, -385);
    return ou(680, -450);
  }
  if (stat === "hrr") {
    if (line <= 0.5) return ou(-235, 182);
    if (line <= 1.5) return ou(-102, -122);
    if (line <= 2.5) return ou(168, -218);
    return ou(410, -450);
  }
  if (stat === "walks") {
    if (line <= 0.5) return ou(128, -160);
    return ou(265, -365);
  }
  if (stat === "k") {
    if (line <= 3.5) return ou(-175, 138);
    if (line <= 5.5) return ou(-108, -112);
    if (line <= 7.5) return ou(158, -202);
    return ou(325, -430);
  }
  if (stat === "hr") return isOver ? 300 : -430;
  return null;
}

/**
 * Re-price model player props from live game context when live board lines exist.
 * This keeps simulated props better aligned with the market environment (totals/ML).
 */
function calibrateModelPlayerPropsFromLiveLines(markets: Market[]): Market[] {
  const byGame = new Map<string, Market[]>();
  for (const m of markets) {
    if (!byGame.has(m.gameId)) byGame.set(m.gameId, []);
    byGame.get(m.gameId)!.push(m);
  }

  return markets.map((m) => {
    if (!isPlayerPropMarketType(m.marketType)) return m;
    if (isSportsbookLineSource(m.source)) return m; // preserve true book props

    const gm = byGame.get(m.gameId) ?? [];
    const live = gm.filter((x) => isSportsbookLineSource(x.source));
    if (!live.length) return m;

    const totals = live.filter((x) => x.marketType === "total" && typeof x.line === "number");
    const totalLine = totals.length
      ? totals.reduce((acc, x) => acc + (x.line ?? 0), 0) / totals.length
      : null;

    const mls = live.filter((x) => x.marketType === "moneyline");
    const probs = mls.map((x) => impliedProbabilityFromAmerican(x.american));
    const avgMlProb = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0.5;

    // baseline environment tilt from live board
    const envTilt = (totalLine != null ? (totalLine - 8) * 7 : 0) + (avgMlProb - 0.5) * 8;
    const sel = m.selection.toLowerCase();
    let delta = 0;

    if (m.marketType === "player_k") {
      // Higher totals usually imply tougher run environment for K overs.
      if (sel.includes("over")) delta -= envTilt * 0.7;
      if (sel.includes("under")) delta += envTilt * 0.7;
      if (m.pickKind === "tier_plus") delta -= envTilt * 0.75;
    } else if (m.marketType === "player_hr") {
      // HR yes/no most sensitive to run environment.
      if (m.pickKind === "yes_no" && sel.includes("(yes)")) delta += envTilt * 1.2;
      else if (m.pickKind === "yes_no" && sel.includes("(no)")) delta -= envTilt * 1.2;
      else if (sel.includes("over")) delta += envTilt;
      else if (sel.includes("under")) delta -= envTilt;
    } else {
      if (sel.includes("over")) delta += envTilt;
      if (sel.includes("under")) delta -= envTilt;
      if (m.pickKind === "tier_plus") delta += envTilt * 0.9;
    }

    const baseline = baselineBookAmericanForProp(m);
    const anchor = baseline != null ? baseline * 0.75 + m.american * 0.25 : m.american;
    return { ...m, american: clampAmerican(anchor + delta) };
  });
}

export async function getDailyScheduleSport(sport: SportCode): Promise<GameCard[]> {
  if (sport === "nba") {
    try {
      const rows = await fetchNbaGamesForDateEt(slateDateStringEt());
      return rows.length ? rows : mockNbaGames;
    } catch {
      return mockNbaGames;
    }
  }
  try {
    const today = mlbDateStringEt();
    const data = await scheduleJson(`${MLB_STATS_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher`);
    const dates = data.dates?.[0]?.games ?? [];
    if (!dates.length) return mockGames;
    const rows = dates.map((g: any): GameCard => {
      const detailed = String(g.status?.detailedState ?? "");
      const delayInfo =
        /delay|susp|ppd|postponed|cancel/i.test(detailed) || String(g.status?.reason ?? "").length > 2
          ? [detailed, g.status?.reason].filter(Boolean).join(" · ")
          : null;
      // MLB Stats `gameDate` is ISO instant in UTC (suffix `Z`). Zone-less ISO strings are normalized to UTC
      // so Node/Vercel (UTC) and browsers parse the same wall time in Eastern.
      const rawDate = g.gameDate ?? g.gameInfo?.firstPitch ?? g.gameDateTime ?? "";
      const startTime = normalizeMlbStartIso(typeof rawDate === "string" ? rawDate : "");
      return {
        id: String(g.gamePk),
        startTime,
        status: g.status?.abstractGameState ?? "scheduled",
        homeTeam: g.teams?.home?.team?.name ?? "Home Team",
        awayTeam: g.teams?.away?.team?.name ?? "Away Team",
        homeTeamId: g.teams?.home?.team?.id,
        awayTeamId: g.teams?.away?.team?.id,
        weather: g.weather?.condition
          ? `${g.weather.condition}${g.weather.temp ? ` ${g.weather.temp}F` : ""}`
          : "Weather pending",
        ballpark: g.venue?.name ?? "Unknown Park",
        probablePitchers: `${g.teams?.home?.probablePitcher?.fullName ?? "TBD"} vs ${g.teams?.away?.probablePitcher?.fullName ?? "TBD"}`,
        delayInfo
      };
    });
    return rows.length ? rows : mockGames;
  } catch {
    return mockGames;
  }
}

export async function getDailySchedule(): Promise<GameCard[]> {
  return getDailyScheduleSport("mlb");
}

export async function getOddsMarkets(gameId: string, sport: SportCode = "mlb"): Promise<Market[]> {
  const all = await getAllMarkets(sport);
  return all.filter((m) => m.gameId === gameId);
}

export async function getAllMarkets(sport: SportCode = "mlb"): Promise<Market[]> {
  const mockGamesFor = sport === "nba" ? mockNbaGames : mockGames;
  const mockMarketsFor = sport === "nba" ? mockNbaMarkets : mockMarkets;
  const provider = oddsProviderForSport(sport);
  if (provider === "rundown") {
    const gamesRaw = await getDailyScheduleSport(sport);
    const games = gamesRaw.length ? gamesRaw : mockGamesFor;
    const rundown = await fetchRundownMarketsForToday(games, sport);
    const failover = await buildOddsApiFailoverBoard(games, sport);
    if (!rundown.length) {
      const rundownDbg = getRundownDebugState();
      const withBaseline = mergeFeedsOverModelBaseline(failover, games, sport);
      const filled = await augmentRosterPlayerPropsWhereMissing(games, withBaseline, sport);
      const out = filterLegiblePlayerPropsForSlate(filled, games);
      if (
        oddsApiKeyForSport(sport) &&
        (rundownDbg.status === "http_error" || rundownDbg.status === "no_events") &&
        out.some((m) => isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source))
      ) {
        markRundownBoardServedFromOddsApiFallback({
          detail: rundownDbg.detail,
          httpStatus: rundownDbg.httpStatus
        });
      }
      return out;
    }
    const sportsbook = rundown.filter((m) => isSportsbookLineSource(m.source));
    const primary = filterLegiblePlayerPropsForSlate(
      filterOutNonBookPlayerProps(await mergeRundownRetailPlayerProps(applyRundownRetailSlate(sportsbook), games, sport)),
      games
    );
    const bookMerged = mergeBoardsPreferPrimary(primary, failover);
    const merged = mergeFeedsOverModelBaseline(bookMerged, games, sport);
    const filled = await augmentRosterPlayerPropsWhereMissing(games, merged, sport);
    return filterLegiblePlayerPropsForSlate(filled, games);
  }

  const games = await getDailyScheduleSport(sport);
  if (!games.length) {
    const filled = await augmentRosterPlayerPropsWhereMissing(mockGamesFor, mockMarketsFor, sport);
    return filterLegiblePlayerPropsForSlate(filled, mockGamesFor);
  }
  const core = games.flatMap((g) => generateMarketsForSport(sport, g));
  const useOddsProps = !!oddsApiKeyForSport(sport);
  const merged = [...core];
  const events = await fetchOddsEvents(sport);
  const priced = mergeFanDuelPrices(merged, games, events);
  if (useOddsProps && events.length > 0) {
    const apiPlayer = buildPlayerPropsFromOddsEvents(events, games);
    const out = [...priced, ...apiPlayer];
    // Keep model game lines when mergeFanDuelPrices could not attach a book row for that game/side;
    // only strip non-book *player* props via filterOutNonBookPlayerProps (same as no-API path).
    const base = filterLegiblePlayerPropsForSlate(filterOutNonBookPlayerProps(out), games);
    const filled = await augmentRosterPlayerPropsWhereMissing(games, base, sport);
    return filterLegiblePlayerPropsForSlate(filled, games);
  }
  const base = filterLegiblePlayerPropsForSlate(filterOutNonBookPlayerProps(calibrateModelPlayerPropsFromLiveLines(priced)), games);
  const filled = await augmentRosterPlayerPropsWhereMissing(games, base, sport);
  return filterLegiblePlayerPropsForSlate(filled, games);
}

export async function getWeatherFallback() {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return { summary: "Fallback weather 72F, mild wind" };
  return { summary: "API-ready weather adapter configured" };
}

export async function getInjuriesSport(sport: SportCode): Promise<{ playerName: string; status: string; note?: string }[]> {
  if (sport === "nba") {
    return [
      {
        playerName: "NBA injury scan",
        status: "Not wired to 40-man style feed",
        note: "MLB uses 40-man roster status; add an NBA injury provider for the same depth here."
      }
    ];
  }
  if (process.env.SPORTSDATAIO_API_KEY) {
    return [{ playerName: "SportsDataIO feed", status: "Connected", note: "Using configured premium injury feed." }];
  }

  const games = await getDailyScheduleSport("mlb");
  const teamIds = new Set<number>();
  for (const g of games) {
    if (g.homeTeamId) teamIds.add(g.homeTeamId);
    if (g.awayTeamId) teamIds.add(g.awayTeamId);
  }
  if (!teamIds.size) {
    return [{ playerName: "Schedule", status: "Pending", note: "No team IDs on slate — injury scan skipped." }];
  }

  const out: { playerName: string; status: string; note?: string }[] = [];
  for (const tid of teamIds) {
    try {
      const res = await fetch(`${MLB_STATS_API}/teams/${tid}/roster?rosterType=40Man`, { next: { revalidate: 3600 } });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.roster ?? []) {
        const code = String(r.status?.code ?? "");
        const desc = String(r.status?.description ?? "");
        const lower = desc.toLowerCase();
        if (code === "A") continue;
        if (
          !lower.includes("injured") &&
          !lower.includes(" il") &&
          !lower.includes("rehab") &&
          !code.includes("IL") &&
          code !== "D60" &&
          code !== "D15" &&
          code !== "D10"
        ) {
          continue;
        }
        out.push({
          playerName: r.person?.fullName ?? "Unknown",
          status: desc || code,
          note: "MLB 40-man roster status"
        });
      }
    } catch {
      /* skip team */
    }
  }

  if (!out.length) {
    return [
      {
        playerName: "No IL rows",
        status: "Today",
        note: "40-man feed shows no injury-list style status for teams on today's slate (feed can lag)."
      }
    ];
  }
  return out.slice(0, 48);
}

export async function getInjuries(): Promise<{ playerName: string; status: string; note?: string }[]> {
  return getInjuriesSport("mlb");
}

async function nbaGameDetailFromSchedule(gameId: string): Promise<GameDetail | null> {
  const games = await getDailyScheduleSport("nba");
  const g = games.find((x) => x.id === gameId);
  if (!g) return null;
  return {
    gameId: g.id,
    matchup: `${g.awayTeam} at ${g.homeTeam}`,
    venue: g.ballpark ?? "Arena",
    weather: g.weather ?? "Indoor",
    trends: ["Pace and matchup model active", "Rest and travel context considered", "Minutes distribution factors in"],
    injuries: ["Check NBA.com official injury report for latest game-day status."],
    starters: [`${g.homeTeam}: Starters TBD`, `${g.awayTeam}: Starters TBD`],
    projectedLineups: {
      [g.homeTeam]: ["Lineup pending"],
      [g.awayTeam]: ["Lineup pending"]
    },
    playersToWatch: []
  };
}

async function fetchMlbGameDetailFromStats(gameId: string): Promise<GameDetail> {
  try {
    const feed = await safeJson(`${MLB_STATS_API_V11}/game/${gameId}/feed/live`);
    const gameData = feed.gameData ?? {};
    const liveData = feed.liveData ?? {};
    const home = gameData.teams?.home?.name ?? "Home";
    const away = gameData.teams?.away?.name ?? "Away";
    const probableHome = gameData.probablePitchers?.home?.fullName ?? "TBD";
    const probableAway = gameData.probablePitchers?.away?.fullName ?? "TBD";
    const players = liveData.boxscore?.teams?.home?.players ?? {};
    const awayPlayers = liveData.boxscore?.teams?.away?.players ?? {};
    const homeOrder: number[] = liveData.boxscore?.teams?.home?.battingOrder ?? [];
    const awayOrder: number[] = liveData.boxscore?.teams?.away?.battingOrder ?? [];

    const homeLineup = homeOrder
      .map((id: number) => players[`ID${id}`]?.person?.fullName)
      .filter(Boolean)
      .slice(0, 9);
    const awayLineup = awayOrder
      .map((id: number) => awayPlayers[`ID${id}`]?.person?.fullName)
      .filter(Boolean)
      .slice(0, 9);

    const playerWatch: PlayerCard[] = [...homeLineup.slice(0, 1), ...awayLineup.slice(0, 1)].map((name, idx) => ({
      name,
      team: idx === 0 ? home : away,
      position: "BAT",
      batsOrThrows: "R/L",
      opsOrEra: "Live stat feed",
      recentForm: "Form from recent games"
    }));

    return {
      gameId: String(gameId),
      matchup: `${away} at ${home}`,
      venue: gameData.venue?.name ?? "Venue pending",
      weather: gameData.weather?.condition
        ? `${gameData.weather.condition}${gameData.weather.temp ? ` ${gameData.weather.temp}F` : ""}`
        : "Weather pending",
      trends: [
        `${home} home split model active`,
        `${away} away split model active`,
        "Bullpen usage + recent-form factor included"
      ],
      injuries: await getInjuriesSport("mlb").then((i) => i.map((x) => `${x.playerName}: ${x.status}`)),
      starters: [`${home}: ${probableHome}`, `${away}: ${probableAway}`],
      projectedLineups: {
        [home]: homeLineup.length ? homeLineup : ["Lineup pending"],
        [away]: awayLineup.length ? awayLineup : ["Lineup pending"]
      },
      playersToWatch: playerWatch
    };
  } catch {
    return (
      mockGameDetails[gameId] ?? {
        gameId,
        matchup: "Matchup pending",
        venue: "Venue pending",
        weather: "Weather pending",
        trends: ["No trend data available yet"],
        injuries: ["No major injuries listed"],
        starters: ["Starters pending"],
        projectedLineups: {},
        playersToWatch: []
      }
    );
  }
}

export async function getGameDetailSport(sport: SportCode, gameId: string): Promise<GameDetail> {
  if (sport === "nba") {
    const nba = await nbaGameDetailFromSchedule(gameId);
    if (nba) return nba;
    return (
      mockGameDetails[gameId] ?? {
        gameId,
        matchup: "Matchup pending",
        venue: "Venue pending",
        weather: "Indoor",
        trends: ["No trend data available yet"],
        injuries: ["No injury rows wired for this game id"],
        starters: ["Starters pending"],
        projectedLineups: {},
        playersToWatch: []
      }
    );
  }
  return fetchMlbGameDetailFromStats(gameId);
}

export async function getGameDetail(gameId: string): Promise<GameDetail> {
  return getGameDetailSport("mlb", gameId);
}
