/**
 * Sportsbook lines via The Odds API — requires ODDS_API_KEY.
 * Prefers FanDuel, then DraftKings when FanDuel is missing for an event.
 * Cache TTL from `oddsApiRevalidateSeconds()` (default 24h) to limit API usage — set ODDS_CACHE_SECONDS to override.
 */

import { isPlayerPropMarketType, oddsApiRevalidateSeconds } from "./odds";
import { oddsApiKeyForSport, type SportCode } from "./sportContext";
import { GameCard, Market } from "./types";
import { HITTER_MATRIX, PITCHER_MATRIX, type PickKind, type StatKey } from "./playerPropCatalog";

type OddsOutcome = { name?: string; description?: string; point?: number; price?: number };
export type OddsDebugState = {
  status: "idle" | "ok" | "missing_key" | "http_error" | "no_events" | "exception";
  detail?: string;
  httpStatus?: number;
  remaining?: string;
  used?: string;
  updatedAt: string;
};

let lastOddsDebug: OddsDebugState = {
  status: "idle",
  detail: "No odds request yet",
  updatedAt: new Date(0).toISOString()
};

function setOddsDebug(patch: Omit<OddsDebugState, "updatedAt">) {
  lastOddsDebug = { ...patch, updatedAt: new Date().toISOString() };
}

export function getOddsDebugState(): OddsDebugState {
  return lastOddsDebug;
}

function normTeam(s: string): string {
  return s.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

/** Longest-first so "blue jays" beats "jays" and "white sox" beats "sox". */
const MLB_NICKNAMES_DESC = [
  "white sox",
  "red sox",
  "blue jays",
  "diamondbacks",
  "guardians",
  "nationals",
  "phillies",
  "mariners",
  "braves",
  "yankees",
  "orioles",
  "rangers",
  "twins",
  "mets",
  "cubs",
  "royals",
  "tigers",
  "rockies",
  "astros",
  "dodgers",
  "brewers",
  "angels",
  "marlins",
  "reds",
  "rays",
  "cardinals",
  "pirates",
  "padres",
  "giants",
  "athletics"
];

/** NBA city + nickname endings for Odds API ↔ schedule name matching. */
const NBA_NICKNAMES_DESC = [
  "trail blazers",
  "timberwolves",
  "76ers",
  "sixers",
  "warriors",
  "lakers",
  "celtics",
  "bucks",
  "nuggets",
  "suns",
  "heat",
  "knicks",
  "nets",
  "bulls",
  "cavaliers",
  "mavericks",
  "rockets",
  "spurs",
  "grizzlies",
  "pelicans",
  "thunder",
  "jazz",
  "kings",
  "clippers",
  "raptors",
  "hawks",
  "hornets",
  "magic",
  "wizards",
  "pistons",
  "pacers"
];

const LEAGUE_TEAM_NICKNAMES = [...MLB_NICKNAMES_DESC, ...NBA_NICKNAMES_DESC];

/** Map Odds API / common abbreviations to the same key as full league team names. */
export function teamKey(s: string): string {
  const n = normTeam(s)
    .replace(/d[\s-]?backs/g, "diamondbacks")
    .replace(/\ba's\b/g, "athletics")
    .replace(/\bchi white sox\b/g, "white sox")
    .replace(/\bchi cubs\b/g, "cubs")
    .replace(/'/g, "'");
  if (/athletic|^a s$|^as$/.test(n)) return "athletics";
  for (const nick of LEAGUE_TEAM_NICKNAMES) {
    if (n === nick || n.endsWith(" " + nick)) return nick;
  }
  const parts = n.split(" ").filter(Boolean);
  return parts[parts.length - 1] ?? n;
}

export function teamsMatchLoose(a: string, b: string): boolean {
  const x = normTeam(a);
  const y = normTeam(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return teamKey(a) === teamKey(b);
}

/** Normalize person names for comparison (Odds API vs MLB roster strings). */
function normPlayerName(s: string): string {
  return normTeam(s);
}

const SIDE_WORD = /^(over|under|yes|no)$/i;

/** Normalize common feed mojibake / separator artifacts into plain ASCII spacing. */
function cleanFeedText(s: string): string {
  return String(s ?? "")
    .replace(/Â·|â€¢|â€˘|â—|A�/g, " ")
    .replace(/[•·]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Odds API player props usually put the batter/pitcher in `description` and Over/Under in `name`.
 * Some responses flip that — resolve a single player label without using loose substring matching.
 */
function outcomePlayerLabel(o: OddsOutcome): string {
  const name = cleanFeedText((o.name ?? "").trim());
  const desc = cleanFeedText((o.description ?? "").trim());
  if (desc && SIDE_WORD.test(name)) return desc;
  if (name && SIDE_WORD.test(desc)) return name;
  if (desc && !SIDE_WORD.test(desc)) return desc;
  if (name && !SIDE_WORD.test(name)) return name;
  return desc || name;
}

/** Exact normalized match, or same last name + same first initial (guards cross-match on "Chris…"). */
function playerNamesMatch(boardPlayer: string, apiLabel: string): boolean {
  const a = normPlayerName(boardPlayer);
  const b = normPlayerName(apiLabel);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.length < 2 || tb.length < 2) return false;
  const lastA = ta[ta.length - 1];
  const lastB = tb[tb.length - 1];
  if (lastA.length < 2 || lastB.length < 2 || lastA !== lastB) return false;
  return ta[0][0] === tb[0][0];
}

export function findGameForEvent(event: { home_team?: string; away_team?: string }, games: GameCard[]): GameCard | undefined {
  const ht = event.home_team ?? "";
  const at = event.away_team ?? "";
  const direct = games.find((g) => teamsMatchLoose(g.homeTeam, ht) && teamsMatchLoose(g.awayTeam, at));
  if (direct) return direct;
  return games.find((g) => teamsMatchLoose(g.homeTeam, at) && teamsMatchLoose(g.awayTeam, ht));
}

function getPreferredBook(event: { bookmakers?: Array<{ key?: string; markets?: unknown[] }> }) {
  const bms = event.bookmakers ?? [];
  return bms.find((b) => b.key === "fanduel") ?? bms.find((b) => b.key === "draftkings") ?? bms[0];
}

function mergeEventsById(lists: unknown[][]): unknown[] {
  type Bk = { key?: string; title?: string; markets?: unknown[] };
  const byEvent = new Map<string, { ev: Record<string, unknown>; books: Map<string, { bk: Record<string, unknown>; markets: unknown[] }> }>();

  for (const list of lists) {
    for (const raw of list) {
      const ev = raw as { id?: string; bookmakers?: Bk[] };
      const id = String(ev.id ?? "");
      if (!id) continue;
      let slot = byEvent.get(id);
      if (!slot) {
        slot = { ev: ev as Record<string, unknown>, books: new Map() };
        byEvent.set(id, slot);
      }
      for (const bk of ev.bookmakers ?? []) {
        const k = String(bk.key ?? "unknown").trim().toLowerCase() || "unknown";
        const next = [...(bk.markets ?? [])];
        if (!slot.books.has(k))
          slot.books.set(k, { bk: { ...(bk as Record<string, unknown>) }, markets: next });
        else slot.books.get(k)!.markets.push(...next);
      }
    }
  }

  return [...byEvent.values()].map(({ ev, books }) => {
    const bookmakers = [...books.values()].map(({ bk, markets }) => ({ ...bk, markets }));
    return { ...ev, bookmakers: bookmakers.length ? bookmakers : [{ key: "fanduel", title: "FanDuel", markets: [] }] };
  });
}

const PLAYER_PROP_API_KEYS = new Set([
  "batter_hits",
  "batter_hits_alternate",
  "batter_home_runs",
  "batter_home_runs_alternate",
  "batter_total_bases",
  "batter_total_bases_alternate",
  "batter_rbis",
  "batter_rbis_alternate",
  "batter_runs_scored",
  "batter_runs_scored_alternate",
  "batter_hits_runs_rbis",
  "batter_hits_runs_rbis_alternate",
  "pitcher_strikeouts",
  "pitcher_strikeouts_alternate",
  "batter_walks",
  "batter_walks_alternate",
  "player_points",
  "player_points_alternate",
  "player_rebounds",
  "player_rebounds_alternate",
  "player_assists",
  "player_assists_alternate",
  "player_threes",
  "player_threes_alternate",
  "player_blocks",
  "player_blocks_alternate",
  "player_steals",
  "player_steals_alternate",
  "player_turnovers",
  "player_turnovers_alternate",
  "player_points_rebounds_assists",
  "player_points_rebounds_assists_alternate"
]);

const API_KEY_TO_STAT: Record<string, StatKey | undefined> = {
  batter_hits: "hits",
  batter_hits_alternate: "hits",
  batter_home_runs: "hr",
  batter_home_runs_alternate: "hr",
  batter_total_bases: "tb",
  batter_total_bases_alternate: "tb",
  batter_rbis: "rbi",
  batter_rbis_alternate: "rbi",
  batter_runs_scored: "runs",
  batter_runs_scored_alternate: "runs",
  batter_hits_runs_rbis: "hrr",
  batter_hits_runs_rbis_alternate: "hrr",
  pitcher_strikeouts: "k",
  pitcher_strikeouts_alternate: "k",
  batter_walks: "walks",
  batter_walks_alternate: "walks",
  player_points: "points",
  player_points_alternate: "points",
  player_rebounds: "rebounds",
  player_rebounds_alternate: "rebounds",
  player_assists: "assists",
  player_assists_alternate: "assists",
  player_threes: "threes",
  player_threes_alternate: "threes",
  player_blocks: "blocks",
  player_blocks_alternate: "blocks",
  player_steals: "steals",
  player_steals_alternate: "steals",
  player_points_rebounds_assists: "pra",
  player_points_rebounds_assists_alternate: "pra"
};

function apiKeyToStat(apiKey: string): StatKey | undefined {
  const k = apiKey.toLowerCase();
  const mapped = API_KEY_TO_STAT[k];
  if (mapped) return mapped;
  if (k.includes("strikeout")) return "k";
  if (k.includes("home_run")) return "hr";
  if (k.includes("total_bases")) return "tb";
  if (k.includes("hits_runs_rbis")) return "hrr";
  if (k.includes("runs_scored")) return "runs";
  if (k.includes("rbis")) return "rbi";
  if (k.includes("walk")) return "walks";
  if (k.includes("batter_hits")) return "hits";
  if (k.includes("points_rebounds_assists")) return "pra";
  if (k.includes("player_points")) return "points";
  if (k.includes("player_rebounds")) return "rebounds";
  if (k.includes("player_assists")) return "assists";
  if (k.includes("threes") || k.includes("three")) return "threes";
  if (k.includes("player_blocks")) return "blocks";
  if (k.includes("player_steals")) return "steals";
  return undefined;
}

function statLabel(stat: StatKey): string {
  if (stat === "k") return PITCHER_MATRIX.k.label;
  const row = HITTER_MATRIX[stat as Exclude<StatKey, "k">];
  return row?.label ?? String(stat);
}

/** Build player prop markets straight from Odds API (all listed books) — avoids roster line mismatch. */
export function buildPlayerPropsFromOddsEvents(events: unknown[], games: GameCard[]): Market[] {
  const rows: Market[] = [];
  for (const raw of events) {
    const ev = raw as Record<string, unknown>;
    const game = findGameForEvent(ev as { home_team?: string; away_team?: string }, games);
    if (!game) continue;
    const bms = (ev.bookmakers as Array<{ key?: string; markets?: unknown[] }>) ?? [];
    for (const bk of bms) {
      const bkKey = String(bk.key ?? "unknown").trim().toLowerCase();
      const mkts = bk.markets ?? [];
      for (const mRaw of mkts) {
        const mk = mRaw as { key?: string; outcomes?: OddsOutcome[] };
        const apiKey = mk.key ?? "";
        const stat = apiKeyToStat(apiKey);
        if (!stat) continue;

        for (const o of mk.outcomes ?? []) {
          if (typeof o.price !== "number") continue;
          const playerName = cleanFeedText(outcomePlayerLabel(o).trim());
          if (!playerName || SIDE_WORD.test(playerName)) continue;

          const nm = String(o.name ?? "").trim().toLowerCase();
          const pt = o.point;
          let selection = "";
          let line: number | null = pt ?? null;
          let pickKind: PickKind;

          if (stat === "hr" && (nm === "yes" || nm === "no")) {
            pickKind = "yes_no";
            line = null;
            selection = nm === "yes" ? `${playerName} · To hit a home run (Yes)` : `${playerName} · To hit a home run (No)`;
          } else if (nm === "over" || nm === "under") {
            pickKind = "over_under";
            const side = nm === "over" ? "Over" : "Under";
            const ln = pt != null ? String(pt) : "";
            selection = `${playerName} · ${side} ${ln} ${statLabel(stat)}`.replace(/\s+/g, " ").trim();
          } else {
            continue;
          }
          const id = `${game.id}-sb-${stat}-${idSlug(playerName)}-${idSlug(apiKey)}-${nm}-${String(pt ?? "x")}-${bkKey}`.slice(0, 120);
          rows.push({
            id,
            gameId: game.id,
            marketType: `player_${stat}`,
            selection,
            line,
            american: o.price,
            source: bkKey,
            playerName,
            statKey: stat,
            pickKind,
            tierMin: null
          });
        }
      }
    }
  }
  return rows;
}

const STAT_TO_ODDS_MARKET: Record<StatKey, string> = {
  hits: "batter_hits",
  runs: "batter_runs_scored",
  rbi: "batter_rbis",
  tb: "batter_total_bases",
  hrr: "batter_hits_runs_rbis",
  hr: "batter_home_runs",
  walks: "batter_walks",
  k: "pitcher_strikeouts",
  points: "player_points",
  rebounds: "player_rebounds",
  assists: "player_assists",
  threes: "player_threes",
  pra: "player_points_rebounds_assists",
  blocks: "player_blocks",
  steals: "player_steals"
};

function statKeyToOddsMarketKey(stat: StatKey): string {
  return STAT_TO_ODDS_MARKET[stat] ?? "batter_hits";
}

function normTeamLabel(s: string): string {
  return s.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

/**
 * True when a Rundown row can be mapped into The Odds API `bookmakers[].markets[].outcomes[]` shape
 * (stat O/U or HR yes/no) — excludes team alt run / spread lines.
 */
export function isRundownMarketAdaptableToOddsLayout(m: Market, game: GameCard | undefined): boolean {
  if (!isPlayerPropMarketType(m.marketType)) return false;
  if (!/^rundown:/i.test(String(m.source))) return false;
  if (!m.statKey) return false;
  const low = m.selection.toLowerCase();
  const hasOu = /\bover\b|\bunder\b/.test(low);
  const hasHrYn =
    m.statKey === "hr" && (/\(yes\)|\(no\)/.test(low) || (/\byes\b/.test(low) && !/\bover\b/.test(low)));
  if (!hasOu && !hasHrYn) return false;
  const pn = String(m.playerName ?? "").trim();
  if (!pn || pn.split(/\s+/).filter(Boolean).length < 2) return false;
  if (game) {
    const pnorm = normTeamLabel(pn);
    if (pnorm === normTeamLabel(game.homeTeam) || pnorm === normTeamLabel(game.awayTeam)) return false;
  }
  return true;
}

function parseRundownRowToOddsOutcome(m: Market): OddsOutcome | null {
  if (typeof m.american !== "number" || !Number.isFinite(m.american)) return null;
  const desc = String(m.playerName ?? "").trim();
  if (!desc) return null;
  const low = m.selection.toLowerCase();
  if (m.statKey === "hr" && (/\(yes\)|\(no\)/.test(low) || (/\byes\b/.test(low) && !/\bover\b/.test(low)))) {
    const isNo = /\(no\)/.test(low) || /\bno\b/.test(low);
    const isYes = /\(yes\)/.test(low) || (/\byes\b/.test(low) && !isNo);
    if (!isYes && !isNo) return null;
    return { name: isYes ? "yes" : "no", description: desc, price: m.american };
  }
  if (!/\bover\b/.test(low) && !/\bunder\b/.test(low)) return null;
  const nm = /\bunder\b/.test(low) ? "under" : "over";
  const pt = m.line;
  if (pt == null || !Number.isFinite(Number(pt))) return null;
  return { name: nm, description: desc, point: Number(pt), price: m.american };
}

/**
 * Re-shape Rundown `Market[]` into synthetic Odds API event objects so {@link buildPlayerPropsFromOddsEvents}
 * can build the same `player_*` rows without billing The Odds API (Rundown key only).
 */
export function rundownMarketsToSyntheticOddsEvents(
  markets: Market[],
  games: GameCard[],
  sport: SportCode = "mlb"
): unknown[] {
  type Slot = { home_team: string; away_team: string; books: Map<string, Map<string, OddsOutcome[]>> };
  const byEvent = new Map<string, Slot>();

  for (const m of markets) {
    const game = games.find((g) => g.id === m.gameId);
    if (!game || !isRundownMarketAdaptableToOddsLayout(m, game)) continue;
    const o = parseRundownRowToOddsOutcome(m);
    if (!o?.description) continue;
    let slot = byEvent.get(m.gameId);
    if (!slot) {
      slot = { home_team: game.homeTeam, away_team: game.awayTeam, books: new Map() };
      byEvent.set(m.gameId, slot);
    }
    const bookKey = String(m.source).toLowerCase().replace(/:/g, "_");
    const mk = statKeyToOddsMarketKey(m.statKey!);
    const mkMap = slot.books.get(bookKey) ?? new Map<string, OddsOutcome[]>();
    if (!slot.books.has(bookKey)) slot.books.set(bookKey, mkMap);
    const arr = mkMap.get(mk) ?? [];
    arr.push(o);
    mkMap.set(mk, arr);
  }

  return [...byEvent.entries()].map(([id, slot]) => ({
    id,
    home_team: slot.home_team,
    away_team: slot.away_team,
    sport_key: sport === "nba" ? "basketball_nba" : "baseball_mlb",
    bookmakers: [...slot.books.entries()].map(([bk, mkMap]) => ({
      key: bk,
      markets: [...mkMap.entries()].map(([marketKey, outcomes]) => ({
        key: marketKey,
        outcomes
      }))
    }))
  }));
}

function idSlug(s: string, max = 36): string {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, max);
}

/** Allowed on bulk GET /odds — see https://the-odds-api.com/liveapi/guides/v4/api-error-codes.html#invalid-market */
const FEATURED_MARKETS = "h2h,spreads,totals";
const LIVE_REGIONS = "us,us2,eu,uk,au";
const EVENT_REGIONS = "us";

/** Alternate / period / team markets — require per-event odds endpoint */
const EXTENDED_CORE_MARKETS =
  "h2h_1st_5_innings,totals_1st_1_innings,team_totals,alternate_team_totals";

const PLAYER_MARKETS =
  "batter_hits,batter_hits_alternate,batter_home_runs,batter_home_runs_alternate,batter_total_bases,batter_total_bases_alternate,batter_rbis,batter_rbis_alternate,batter_runs_scored,batter_runs_scored_alternate,batter_hits_runs_rbis,batter_hits_runs_rbis_alternate,pitcher_strikeouts,pitcher_strikeouts_alternate,batter_walks,batter_walks_alternate";

const MLB_NONFEATURED_MARKETS_COMBINED = `${EXTENDED_CORE_MARKETS},${PLAYER_MARKETS}`;

const NBA_PLAYER_MARKETS =
  "player_points,player_points_alternate,player_rebounds,player_rebounds_alternate,player_assists,player_assists_alternate,player_threes,player_threes_alternate,player_blocks,player_blocks_alternate,player_steals,player_steals_alternate,player_turnovers,player_turnovers_alternate,player_points_rebounds_assists,player_points_rebounds_assists_alternate";
const NBA_EXTENDED_CORE_MARKETS = "team_totals,alternate_team_totals";
const NBA_NONFEATURED_MARKETS_COMBINED = `${NBA_EXTENDED_CORE_MARKETS},${NBA_PLAYER_MARKETS}`;

const LAST_GOOD_TTL_MS = 1000 * 60 * 60 * 24; // 24h stale-while-provider-down (align with long cache)
const lastGoodOddsEvents: Partial<Record<SportCode, { events: unknown[]; at: number }>> = {};
const cachedOddsSportKey: Partial<Record<SportCode, { key: string; at: number }>> = {};

function nonFeaturedMarketsCombined(sport: SportCode): string {
  return sport === "nba" ? NBA_NONFEATURED_MARKETS_COMBINED : MLB_NONFEATURED_MARKETS_COMBINED;
}

function playerMarketsForSport(sport: SportCode): string {
  return sport === "nba" ? NBA_PLAYER_MARKETS : PLAYER_MARKETS;
}

function eventRecoveryMax(sport: SportCode): number {
  const raw = sport === "nba" ? process.env.NBA_EVENT_RECOVERY_MAX : process.env.MLB_EVENT_RECOVERY_MAX;
  const n = Number(raw ?? "8");
  return Math.max(1, Math.min(Number.isFinite(n) ? n : 18, 40));
}

function eventOddsMax(sport: SportCode): number {
  const raw = sport === "nba" ? process.env.NBA_EVENT_ODDS_MAX : process.env.MLB_EVENT_ODDS_MAX;
  const n = Number(raw ?? "20");
  return Math.max(1, Math.min(Number.isFinite(n) ? n : 20, 40));
}

function eventOddsConcurrency(sport: SportCode): number {
  const raw = sport === "nba" ? process.env.NBA_EVENT_ODDS_CONCURRENCY : process.env.MLB_EVENT_ODDS_CONCURRENCY;
  const n = Number(raw ?? "3");
  return Math.max(1, Math.min(Number.isFinite(n) ? n : 6, 12));
}

/**
 * Bulk /baseball_mlb/odds only accepts featured markets. Player + alternate props are on
 * GET /events/{eventId}/odds (multiple markets/regions billed per Odds API usage rules).
 */
const DEFAULT_EVENT_BOOKMAKERS = "fanduel,draftkings,betmgm";

function eventOddsBookmakersParam(): string {
  const raw = process.env.ODDS_EVENT_BOOKMAKERS?.trim();
  return encodeURIComponent(raw && raw.length > 0 ? raw : DEFAULT_EVENT_BOOKMAKERS);
}

async function fetchSingleEventExtraOdds(
  apiKey: string,
  sportKey: string,
  eventId: string,
  markets: string,
  books: boolean
): Promise<unknown | null> {
  let q =
    `apiKey=${encodeURIComponent(apiKey)}&regions=${encodeURIComponent(EVENT_REGIONS)}&oddsFormat=american&markets=${encodeURIComponent(markets)}`;
  if (books) q += `&bookmakers=${eventOddsBookmakersParam()}`;
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/odds?${q}`;
  const res = await fetch(url, { next: { revalidate: oddsApiRevalidateSeconds() } });
  if (!res.ok) return null;
  try {
    const j = (await res.json()) as Record<string, unknown>;
    return j && typeof j === "object" && Array.isArray(j.bookmakers) ? j : null;
  } catch {
    return null;
  }
}

async function fetchSingleEventMarketKeys(
  apiKey: string,
  sportKey: string,
  eventId: string,
  sport: SportCode
): Promise<string[]> {
  const url =
    `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events/${encodeURIComponent(eventId)}/markets` +
    `?apiKey=${encodeURIComponent(apiKey)}&regions=${encodeURIComponent(EVENT_REGIONS)}`;
  const res = await fetch(url, { next: { revalidate: oddsApiRevalidateSeconds() } });
  if (!res.ok) return [];
  const payload = (await res.json()) as { bookmakers?: Array<{ markets?: Array<{ key?: string }> }> };
  const keys = new Set<string>();
  for (const bk of payload.bookmakers ?? []) {
    for (const m of bk.markets ?? []) {
      const k = String(m.key ?? "").trim().toLowerCase();
      if (!k) continue;
      const mlbish =
        k.startsWith("batter_") ||
        k.startsWith("pitcher_") ||
        k === "team_totals" ||
        k === "alternate_team_totals" ||
        k === "h2h_1st_5_innings" ||
        k === "totals_1st_1_innings";
      const nbaish =
        k.startsWith("player_") ||
        k === "team_totals" ||
        k === "alternate_team_totals" ||
        k.includes("h2h_q");
      if (sport === "nba" ? nbaish : mlbish) keys.add(k);
    }
  }
  return [...keys];
}

async function fetchEventListBase(apiKey: string, sportKey: string): Promise<Array<Record<string, unknown>>> {
  const url = `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/events?apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { next: { revalidate: oddsApiRevalidateSeconds() } });
  if (!res.ok) return [];
  const out = (await res.json()) as unknown[];
  return Array.isArray(out) ? (out as Array<Record<string, unknown>>) : [];
}

async function resolveOddsSportKey(apiKey: string, sport: SportCode): Promise<string> {
  const slot = cachedOddsSportKey[sport];
  if (slot && Date.now() - slot.at < oddsApiRevalidateSeconds() * 1000) return slot.key;
  const fallback = sport === "nba" ? "basketball_nba" : "baseball_mlb";
  const re = sport === "nba" ? /^basketball_nba($|_)/ : /^baseball_mlb($|_)/;
  const fallbacks =
    sport === "nba" ? [fallback, "basketball_nba_preseason"] : [fallback, "baseball_mlb_preseason", "baseball_mlb_postseason"];
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(apiKey)}`, {
      next: { revalidate: oddsApiRevalidateSeconds() }
    });
    if (!res.ok) return fallback;
    const sports = (await res.json()) as Array<{ key?: string; active?: boolean }>;
    const keys = (sports ?? [])
      .filter((s) => s.active !== false)
      .map((s) => String(s.key ?? ""))
      .filter((k) => re.test(k));
    const tryKeys = keys.length ? keys : fallbacks;
    for (const k of tryKeys) {
      const ev = await fetchEventListBase(apiKey, k);
      if (ev.length) {
        cachedOddsSportKey[sport] = { key: k, at: Date.now() };
        return k;
      }
    }
    cachedOddsSportKey[sport] = { key: fallback, at: Date.now() };
    return fallback;
  } catch {
    return fallback;
  }
}

async function recoverEventsFromEventOddsEndpoint(apiKey: string, sportKey: string, sport: SportCode): Promise<unknown[]> {
  const base = await fetchEventListBase(apiKey, sportKey);
  if (!base.length) return [];
  const maxEvents = Math.max(1, Math.min(eventRecoveryMax(sport), base.length));
  const ids = base.slice(0, maxEvents);

  const out: unknown[] = [];
  for (const ev of ids) {
    const id = String(ev.id ?? "").trim();
    if (!id) continue;
    let featured = await fetchSingleEventExtraOdds(apiKey, sportKey, id, FEATURED_MARKETS, true);
    if (!featured) featured = await fetchSingleEventExtraOdds(apiKey, sportKey, id, FEATURED_MARKETS, false);
    if (featured) out.push(mergeEventsById([[ev], [featured]])[0] ?? featured);
  }
  return out;
}

async function recoverEventsFromUpcomingOdds(apiKey: string, sport: SportCode): Promise<unknown[]> {
  const base =
    "https://api.the-odds-api.com/v4/sports/upcoming/odds" +
    `?apiKey=${encodeURIComponent(apiKey)}&regions=${encodeURIComponent(LIVE_REGIONS)}&oddsFormat=american&markets=${FEATURED_MARKETS}`;
  const res = await fetch(base, { next: { revalidate: oddsApiRevalidateSeconds() } });
  if (!res.ok) return [];
  const out = (await res.json()) as Array<Record<string, unknown>>;
  if (!Array.isArray(out) || !out.length) return [];
  const re = sport === "nba" ? /^basketball_nba($|_)/ : /^baseball_mlb($|_)/;
  return out.filter((e) => re.test(String(e.sport_key ?? "")));
}

/** Merge extras from event-odds into the featured bulk row for one game. */
async function mergeNonFeaturedForOneEvent(
  apiKey: string,
  sportKey: string,
  ev: Record<string, unknown>,
  sport: SportCode
): Promise<unknown> {
  const id = String(ev.id ?? "").trim();
  if (!id) return ev;

  const extMarkets = sport === "nba" ? NBA_EXTENDED_CORE_MARKETS : EXTENDED_CORE_MARKETS;

  for (const books of [true, false]) {
    let detail = await fetchSingleEventExtraOdds(apiKey, sportKey, id, nonFeaturedMarketsCombined(sport), books);
    if (detail) return mergeEventsById([[ev], [detail]])[0] ?? ev;

    const ext = await fetchSingleEventExtraOdds(apiKey, sportKey, id, extMarkets, books);
    const pl = await fetchSingleEventExtraOdds(apiKey, sportKey, id, playerMarketsForSport(sport), books);
    const slices: unknown[] = [];
    if (ext) slices.push(ext);
    if (pl) slices.push(pl);
    if (slices.length) {
      let acc: unknown = ev;
      for (const part of slices) {
        acc = mergeEventsById([[acc as Record<string, unknown>], [part as Record<string, unknown>]])[0] ?? acc;
      }
      return acc;
    }

    // Final attempt: discover live market keys for this event/book and fetch exactly those.
    const discovered = await fetchSingleEventMarketKeys(apiKey, sportKey, id, sport);
    if (discovered.length) {
      const joined = discovered.slice(0, 45).join(",");
      const dyn = await fetchSingleEventExtraOdds(apiKey, sportKey, id, joined, books);
      if (dyn) return mergeEventsById([[ev], [dyn]])[0] ?? dyn;
    }
  }

  return ev;
}

async function enrichOddsEventsWithPerEventOdds(
  sport: SportCode,
  apiKey: string,
  sportKey: string,
  events: unknown[]
): Promise<unknown[]> {
  if (!events.length) return events;
  const maxMerge = Math.max(1, Math.min(eventOddsMax(sport), events.length));
  const concurrency = Math.max(1, Math.min(eventOddsConcurrency(sport), maxMerge));

  const head = events.slice(0, maxMerge).map((e) => e as Record<string, unknown>);
  const tail = events.slice(maxMerge);

  const enriched: unknown[] = [];
  for (let i = 0; i < head.length; i += concurrency) {
    const batch = head.slice(i, i + concurrency);
    const merged = await Promise.all(batch.map((ev) => mergeNonFeaturedForOneEvent(apiKey, sportKey, ev, sport)));
    enriched.push(...merged);
  }
  return enriched.length === events.length ? enriched : [...enriched, ...tail];
}

async function logOddsApiError(res: Response, tag: string): Promise<void> {
  let body = "";
  try {
    body = (await res.text()).replace(/\s+/g, " ").slice(0, 260);
  } catch {
    body = "";
  }
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  setOddsDebug({
    status: "http_error",
    detail: `${tag}: ${body || "HTTP error"}`,
    httpStatus: res.status,
    remaining: remaining ?? undefined,
    used: used ?? undefined
  });
  console.error(
    `[odds-api:${tag}] status=${res.status} remaining=${remaining ?? "?"} used=${used ?? "?"} body=${body || "<empty>"}`
  );
}

export async function fetchOddsEvents(sport: SportCode = "mlb"): Promise<unknown[]> {
  const key = oddsApiKeyForSport(sport);
  if (!key) {
    setOddsDebug({
      status: "missing_key",
      detail: sport === "nba" ? "NBA_ODDS_API_KEY / ODDS_API_KEY is not set" : "ODDS_API_KEY is not set"
    });
    console.warn("[odds-api] odds API key missing; using model prices.");
    return [];
  }
  const sportKey = await resolveOddsSportKey(key, sport);
  const baseWithBooks =
    `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds` +
    `?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(LIVE_REGIONS)}&oddsFormat=american&bookmakers=fanduel,draftkings`;
  const baseAnyBook =
    `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds` +
    `?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(LIVE_REGIONS)}&oddsFormat=american`;
  const baseFeaturedWide =
    `https://api.the-odds-api.com/v4/sports/${encodeURIComponent(sportKey)}/odds` +
    `?apiKey=${encodeURIComponent(key)}&regions=${encodeURIComponent(LIVE_REGIONS)}&oddsFormat=american&markets=${FEATURED_MARKETS}`;
  async function loadFeaturedFeatured(): Promise<unknown[]> {
    try {
      const res = await fetch(`${baseWithBooks}&markets=${FEATURED_MARKETS}`, { next: { revalidate: oddsApiRevalidateSeconds() } });
      if (res.ok) {
        const out = (await res.json()) as unknown[];
        if (out.length)
          setOddsDebug({
            status: "ok",
            detail: `featured bulk (${out.length} events) FanDuel/DK`,
            remaining: res.headers.get("x-requests-remaining") ?? undefined,
            used: res.headers.get("x-requests-used") ?? undefined
          });
        return Array.isArray(out) ? out : [];
      }
      await logOddsApiError(res, "featured-books");
    } catch (e) {
      setOddsDebug({
        status: "exception",
        detail: `featured-books exception: ${e instanceof Error ? e.message : String(e)}`
      });
    }
    return [];
  }

  let events = await loadFeaturedFeatured();
  if (!events.length) {
    try {
      const res = await fetch(`${baseAnyBook}&markets=${FEATURED_MARKETS}`, { next: { revalidate: oddsApiRevalidateSeconds() } });
      if (res.ok) {
        events = (await res.json()) as unknown[];
        if (events.length) {
          setOddsDebug({
            status: "ok",
            detail: `featured bulk (${events.length} events) any-book US`,
            remaining: res.headers.get("x-requests-remaining") ?? undefined,
            used: res.headers.get("x-requests-used") ?? undefined
          });
        }
      } else await logOddsApiError(res, "featured-any-book");
    } catch (e) {
      setOddsDebug({
        status: "exception",
        detail: `featured-any-book exception: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }

  if (!events.length) {
    try {
      const wide = await fetch(baseFeaturedWide, { next: { revalidate: oddsApiRevalidateSeconds() } });
      if (wide.ok) {
        events = (await wide.json()) as unknown[];
        if (events.length)
          setOddsDebug({
            status: "ok",
            detail: `featured-wide (${events.length} events)`,
            remaining: wide.headers.get("x-requests-remaining") ?? undefined,
            used: wide.headers.get("x-requests-used") ?? undefined
          });
      } else await logOddsApiError(wide, "featured-wide");
    } catch (e) {
      setOddsDebug({
        status: "exception",
        detail: `featured-wide exception: ${e instanceof Error ? e.message : String(e)}`
      });
    }
  }

  if (!events.length) {
    // If provider is rejecting requests (e.g. out of usage credits), don't mask
    // it as "no events" — preserve the actual upstream error state.
    if (
      lastOddsDebug.status === "http_error" &&
      /OUT_OF_USAGE_CREDITS|Usage quota has been reached/i.test(String(lastOddsDebug.detail ?? ""))
    ) {
      return [];
    }

    const upcomingRecovered = await recoverEventsFromUpcomingOdds(key, sport).catch(() => []);
    if (upcomingRecovered.length) {
      const enriched = await enrichOddsEventsWithPerEventOdds(sport, key, sportKey, upcomingRecovered);
      if (enriched.length) {
        lastGoodOddsEvents[sport] = { events: enriched, at: Date.now() };
        setOddsDebug({
          status: "ok",
          detail: `recovered from /sports/upcoming/odds (${enriched.length} ${sport.toUpperCase()} events)`
        });
        return enriched;
      }
    }

    const recovered = await recoverEventsFromEventOddsEndpoint(key, sportKey, sport).catch(() => []);
    if (recovered.length) {
      const enriched = await enrichOddsEventsWithPerEventOdds(sport, key, sportKey, recovered);
      lastGoodOddsEvents[sport] = { events: enriched, at: Date.now() };
      setOddsDebug({
        status: "ok",
        detail: `recovered from /events/{id}/odds (${enriched.length} events)`
      });
      return enriched;
    }

    const stale = lastGoodOddsEvents[sport];
    if (stale && Date.now() - stale.at < LAST_GOOD_TTL_MS) {
      setOddsDebug({
        status: "ok",
        detail: `provider empty; using cached board snapshot (${stale.events.length} events)`
      });
      return stale.events;
    }

    setOddsDebug({
      status: "no_events",
      detail: sport === "nba" ? "no NBA featured events from Odds API" : "no MLB featured events from Odds API"
    });
    console.warn(`[odds-api] no ${sport} events returned; using model prices.`);
    return [];
  }

  const enriched = await enrichOddsEventsWithPerEventOdds(sport, key, sportKey, events);
  if (enriched.length) lastGoodOddsEvents[sport] = { events: enriched, at: Date.now() };
  return enriched;
}

export async function fetchMlbOddsEvents(): Promise<unknown[]> {
  return fetchOddsEvents("mlb");
}

function marketList(ev: Record<string, unknown>): unknown[] {
  const book = getPreferredBook(ev as { bookmakers?: Array<{ markets?: unknown[] }> });
  return book?.markets ?? [];
}

function outcomesForKey(markets: unknown[], key: string): OddsOutcome[] {
  const m = (markets as Array<{ key?: string; outcomes?: OddsOutcome[] }>).find((x) => x.key === key);
  return m?.outcomes ?? [];
}

function parseH2hOutcomes(markets: unknown[]): OddsOutcome[] {
  return outcomesForKey(markets, "h2h");
}

function parseTotals(markets: unknown[]): OddsOutcome[] {
  return outcomesForKey(markets, "totals");
}

function parseSpreads(markets: unknown[]): OddsOutcome[] {
  return outcomesForKey(markets, "spreads");
}

function parsePlayerMarket(markets: unknown[], key: string): OddsOutcome[] {
  return outcomesForKey(markets, key);
}

function parseTeamTotalsOutcomes(markets: unknown[]): OddsOutcome[] {
  const out: OddsOutcome[] = [];
  for (const key of ["team_totals", "alternate_team_totals"]) {
    out.push(...outcomesForKey(markets, key));
  }
  return out;
}

/** Combine main + alternate player markets (e.g. HR ladders) for lookup. */
function parsePlayerMarketsMerged(markets: unknown[], keys: string[]): OddsOutcome[] {
  const out: OddsOutcome[] = [];
  for (const key of keys) {
    out.push(...parsePlayerMarket(markets, key));
  }
  return out;
}

const PLAYER_MARKET_KEYS: Record<string, string> = {
  hits: "batter_hits",
  hr: "batter_home_runs",
  tb: "batter_total_bases",
  rbi: "batter_rbis",
  runs: "batter_runs_scored",
  hrr: "batter_hits_runs_rbis",
  walks: "batter_walks",
  k: "pitcher_strikeouts"
};

function pickKind(m: Market): "over_under" | "tier_plus" | "yes_no" {
  if (m.pickKind) return m.pickKind;
  if (/to hit a home run \(yes\)/i.test(m.selection)) return "yes_no";
  if (/\d+\+/.test(m.selection) && !/\bover\b/i.test(m.selection)) return "tier_plus";
  return "over_under";
}

function matchPlayerOutcome(m: Market, o: OddsOutcome): boolean {
  const player = (m.playerName ?? m.selection.split(" · ")[0] ?? "").trim();
  const apiPlayer = outcomePlayerLabel(o);
  if (!player || !apiPlayer) return false;
  if (!playerNamesMatch(player, apiPlayer)) return false;

  const pk = pickKind(m);
  const nm = (o.name ?? "").trim().toLowerCase();
  const pt = o.point;

  if (pk === "yes_no") {
    if (typeof o.price !== "number") return false;
    if (nm === "yes") return true;
    if (nm === "over") {
      if (pt == null) return true;
      if (Math.abs(pt - 0.5) < 0.02 || Math.abs(pt) < 0.02) return true;
    }
    return false;
  }
  if (pk === "tier_plus") {
    if (nm !== "over" || typeof o.price !== "number") return false;
    if (m.line != null && pt != null && Math.abs(Number(m.line) - Number(pt)) > 0.02) return false;
    return true;
  }
  if (m.line != null && pt != null && Math.abs(m.line - pt) > 0.02) return false;
  const sel = m.selection.toLowerCase();
  if (sel.includes("over") && nm !== "over") return false;
  if (sel.includes("under") && nm !== "under") return false;
  return typeof o.price === "number";
}

function matchPlayerNameAndSide(m: Market, o: OddsOutcome): boolean {
  const player = (m.playerName ?? m.selection.split(" · ")[0] ?? "").trim();
  const apiPlayer = outcomePlayerLabel(o);
  if (!player || !apiPlayer || !playerNamesMatch(player, apiPlayer)) return false;
  if (typeof o.price !== "number") return false;
  const pk = pickKind(m);
  const nm = (o.name ?? "").trim().toLowerCase();
  const sel = m.selection.toLowerCase();
  if (pk === "yes_no") {
    if (nm === "yes") return true;
    if (nm === "over") return true;
    return false;
  }
  if (pk === "tier_plus") return nm === "over";
  if (sel.includes("over") && nm !== "over") return false;
  if (sel.includes("under") && nm !== "under") return false;
  return true;
}

function fmtSpreadLine(p: number): string {
  const rounded = Math.round(p * 2) / 2;
  if (Math.abs(p - rounded) < 0.02) {
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  }
  return p > 0 ? `+${p}` : `${p}`;
}

function fmtTotalLine(p: number): string {
  const half = Math.round(p * 2) / 2;
  return Number.isInteger(half) ? `${half}.0` : String(half);
}

function inferRunlineSideTeam(m: Market, game: GameCard): string | null {
  if (m.id.endsWith("-rl-home")) return game.homeTeam;
  if (m.id.endsWith("-rl-away")) return game.awayTeam;
  if (teamsMatchLoose(m.selection, game.homeTeam)) return game.homeTeam;
  if (teamsMatchLoose(m.selection, game.awayTeam)) return game.awayTeam;
  const homeLast = game.homeTeam.split(" ").pop() ?? "";
  const awayLast = game.awayTeam.split(" ").pop() ?? "";
  if (m.selection.startsWith(homeLast)) return game.homeTeam;
  if (m.selection.startsWith(awayLast)) return game.awayTeam;
  return null;
}

function firstFiveTeamFromSelection(m: Market): string {
  const s = m.selection;
  const cut = s.split(/\s*[·•]\s*/)[0]?.trim() ?? s;
  return cut.replace(/\s*\(?\s*F5.*$/i, "").replace(/\s*first\s*5.*$/i, "").trim();
}

function teamTotalParse(m: Market): { team: string; over: boolean } | null {
  const lower = m.selection.toLowerCase();
  const over = /\bover\b/.test(lower);
  const under = /\bunder\b/.test(lower);
  if (over === under) return null;
  const parts = m.selection.split(/\s+Over\s+/i);
  if (parts.length >= 2) return { team: parts[0]!.trim(), over: true };
  const partsU = m.selection.split(/\s+Under\s+/i);
  if (partsU.length >= 2) return { team: partsU[0]!.trim(), over: false };
  return null;
}

function teamTotalOutcomeTeam(o: OddsOutcome): string {
  const nm = (o.name ?? "").trim().toLowerCase();
  const desc = (o.description ?? "").trim();
  if ((nm === "over" || nm === "under") && desc) return desc;
  return (o.name ?? "").trim();
}

function withPlayerLineInSelection(selection: string, oldLine: number, newLine: number): string {
  if (Math.abs(oldLine - newLine) < 0.02) return selection;
  const ou = selection.match(/^(.*·\s*(?:Over|Under)\s+)([\d.]+)(\s.*)?$/i);
  if (ou) return `${ou[1]}${newLine}${ou[3] ?? ""}`;
  const tier = selection.match(/^(.*·\s*)(\d+)\+(\s.*)$/);
  if (tier) return `${tier[1]}${Math.round(newLine)}+${tier[3]}`;
  return selection;
}

function indexEventByGameId(games: GameCard[], events: unknown[]): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const g of games) {
    const ev = events.find((e) => findGameForEvent(e as { home_team: string; away_team: string }, games)?.id === g.id) as
      | Record<string, unknown>
      | undefined;
    if (ev) map.set(g.id, ev);
  }
  return map;
}

export function mergeFanDuelPrices(markets: Market[], games: GameCard[], events: unknown[]): Market[] {
  if (!events.length) return markets;
  const evByGame = indexEventByGameId(games, events);
  return markets.map((m) => {
    const game = games.find((g) => g.id === m.gameId);
    if (!game) return m;
    const ev = evByGame.get(m.gameId);
    if (!ev) return m;
    const mkts = marketList(ev);
    const bookKey = (getPreferredBook(ev as { bookmakers?: Array<{ key?: string; markets?: unknown[] }> })?.key as string) || "book";

    if (m.marketType === "moneyline") {
      for (const o of parseH2hOutcomes(mkts)) {
        if (teamsMatchLoose(o.name ?? "", m.selection) && typeof o.price === "number") {
          return { ...m, american: o.price, source: bookKey };
        }
      }
      return m;
    }

    if (m.marketType === "runline") {
      const spreads = parseSpreads(mkts);
      const sideTeam = inferRunlineSideTeam(m, game);
      if (!sideTeam) return m;
      const candidates = spreads.filter(
        (o) => typeof o.price === "number" && o.point != null && teamsMatchLoose(o.name ?? "", sideTeam)
      );
      if (!candidates.length) return m;
      candidates.sort((a, b) => {
        const ad = Math.abs(Math.abs(a.point!) - 1.5);
        const bd = Math.abs(Math.abs(b.point!) - 1.5);
        if (Math.abs(ad - bd) > 0.001) return ad - bd;
        const al = m.line != null ? Math.abs(a.point! - m.line) : 0;
        const bl = m.line != null ? Math.abs(b.point! - m.line) : 0;
        return al - bl;
      });
      const pick = candidates[0]!;
      const line = pick.point!;
      return {
        ...m,
        american: pick.price!,
        source: bookKey,
        line,
        selection: `${sideTeam} ${fmtSpreadLine(line)}`
      };
    }

    if (m.marketType === "total") {
      const totals = parseTotals(mkts);
      const over = m.selection.toLowerCase().includes("over");
      const want = m.line ?? undefined;
      for (const o of totals) {
        if (want != null && o.point != null && Math.abs(o.point - want) > 0.05) continue;
        const nm = (o.name ?? "").toLowerCase();
        if (over && nm !== "over") continue;
        if (!over && nm !== "under") continue;
        if (typeof o.price === "number") {
          const ln = o.point ?? m.line;
          const lab = over ? "Over" : "Under";
          return { ...m, american: o.price, source: bookKey, line: ln, selection: ln != null ? `${lab} ${fmtTotalLine(ln)}` : m.selection };
        }
      }
      if (want != null) {
        let best: OddsOutcome | undefined;
        let bestD = Infinity;
        for (const o of totals) {
          const nm = (o.name ?? "").toLowerCase();
          if (over && nm !== "over") continue;
          if (!over && nm !== "under") continue;
          if (o.point == null || typeof o.price !== "number") continue;
          const d = Math.abs(o.point - want);
          if (d <= 1.0 && d < bestD) {
            best = o;
            bestD = d;
          }
        }
        if (best && typeof best.price === "number" && best.point != null) {
          const lab = over ? "Over" : "Under";
          return {
            ...m,
            american: best.price,
            source: bookKey,
            line: best.point,
            selection: `${lab} ${fmtTotalLine(best.point)}`
          };
        }
      }
      return m;
    }

    if (m.marketType === "first5") {
      const outs = outcomesForKey(mkts, "h2h_1st_5_innings");
      const wantTeam = firstFiveTeamFromSelection(m);
      for (const o of outs) {
        if (teamsMatchLoose(o.name ?? "", wantTeam) && typeof o.price === "number") {
          return { ...m, american: o.price, source: bookKey };
        }
      }
      return m;
    }

    if (m.marketType === "yrfi") {
      const outs = outcomesForKey(mkts, "totals_1st_1_innings");
      for (const o of outs) {
        const nm = (o.name ?? "").toLowerCase();
        if (nm !== "over" || typeof o.price !== "number") continue;
        if (o.point != null && o.point > 0.25 && o.point < 0.75) {
          return { ...m, american: o.price, source: bookKey, line: o.point };
        }
      }
      return m;
    }

    if (m.marketType === "nrfi") {
      const outs = outcomesForKey(mkts, "totals_1st_1_innings");
      for (const o of outs) {
        const nm = (o.name ?? "").toLowerCase();
        if (nm !== "under" || typeof o.price !== "number") continue;
        if (o.point != null && o.point > 0.25 && o.point < 0.75) {
          return { ...m, american: o.price, source: bookKey, line: o.point };
        }
      }
      return m;
    }

    if (m.marketType === "team_total") {
      const parsed = teamTotalParse(m);
      if (!parsed) return m;
      const tt = parseTeamTotalsOutcomes(mkts);
      const wantLine = m.line ?? undefined;
      const exact = tt.filter((o) => {
        if (typeof o.price !== "number" || o.point == null) return false;
        if (!teamsMatchLoose(teamTotalOutcomeTeam(o), parsed.team)) return false;
        const nm = (o.name ?? "").trim().toLowerCase();
        if (parsed.over && nm !== "over") return false;
        if (!parsed.over && nm !== "under") return false;
        if (wantLine != null && Math.abs(o.point - wantLine) > 0.05) return false;
        return true;
      });
      if (exact[0]) {
        const o = exact[0];
        const ln = o.point ?? m.line;
        const side = parsed.over ? "Over" : "Under";
        return {
          ...m,
          american: o.price!,
          source: bookKey,
          line: ln,
          selection: ln != null ? `${parsed.team} ${side} ${fmtTotalLine(ln)}` : m.selection
        };
      }
      if (wantLine != null) {
        let best: OddsOutcome | undefined;
        let bestD = Infinity;
        for (const o of tt) {
          if (typeof o.price !== "number" || o.point == null) continue;
          if (!teamsMatchLoose(teamTotalOutcomeTeam(o), parsed.team)) continue;
          const nm = (o.name ?? "").trim().toLowerCase();
          if (parsed.over && nm !== "over") continue;
          if (!parsed.over && nm !== "under") continue;
          const d = Math.abs(o.point - wantLine);
          if (d <= 1.5 && d < bestD) {
            best = o;
            bestD = d;
          }
        }
        if (best && best.point != null) {
          const side = parsed.over ? "Over" : "Under";
          return {
            ...m,
            american: best.price!,
            source: bookKey,
            line: best.point,
            selection: `${parsed.team} ${side} ${fmtTotalLine(best.point)}`
          };
        }
      }
      return m;
    }

    if (isPlayerPropMarketType(m.marketType)) {
      const stat = m.statKey ?? m.marketType.replace(/^player_/, "");
      const apiKey = PLAYER_MARKET_KEYS[stat];
      if (!apiKey) return m;
      const outs =
        stat === "hr"
          ? parsePlayerMarketsMerged(mkts, ["batter_home_runs", "batter_home_runs_alternate"])
          : parsePlayerMarket(mkts, apiKey);
      const matches = outs.filter((o) => matchPlayerOutcome(m, o));
      const exact = matches.find(
        (o) => normPlayerName(outcomePlayerLabel(o)) === normPlayerName(m.playerName ?? m.selection.split(" · ")[0] ?? "")
      );
      let pick = exact ?? matches[0];
      if (!pick && pickKind(m) === "over_under" && m.line != null) {
        const loose = outs
          .filter((o) => matchPlayerNameAndSide(m, o) && o.point != null)
          .map((o) => ({ o, d: Math.abs((o.point ?? 0) - m.line!) }))
          .filter((x) => x.d <= 2.5)
          .sort((a, b) => a.d - b.d);
        pick = loose[0]?.o;
      }
      if (!pick && pickKind(m) === "tier_plus" && m.line != null) {
        const loose = outs
          .filter((o) => {
            const nm = (o.name ?? "").trim().toLowerCase();
            return nm === "over" && typeof o.price === "number" && matchPlayerNameAndSide(m, o) && o.point != null;
          })
          .map((o) => ({ o, d: Math.abs((o.point ?? 0) - Number(m.line)) }))
          .filter((x) => x.d <= 1.02)
          .sort((a, b) => a.d - b.d);
        pick = loose[0]?.o;
      }
      if (pick && typeof pick.price === "number") {
        if (m.line == null && pick.point != null && pickKind(m) === "yes_no") {
          return { ...m, american: pick.price, source: bookKey, line: pick.point };
        }
        const newLine = pick.point != null && pickKind(m) !== "yes_no" ? pick.point : m.line;
        const finalLine = newLine ?? m.line;
        const selection =
          m.line != null && pick.point != null && Math.abs(m.line - pick.point) > 0.02
            ? withPlayerLineInSelection(m.selection, m.line, pick.point)
            : m.selection;
        return { ...m, selection, american: pick.price, source: bookKey, line: finalLine };
      }
    }
    return m;
  });
}
