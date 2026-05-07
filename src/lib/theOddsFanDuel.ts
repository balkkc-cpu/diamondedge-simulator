/**
 * Sportsbook lines via The Odds API — requires ODDS_API_KEY.
 * Prefers FanDuel, then DraftKings when FanDuel is missing for an event.
 * Cached 10 minutes via `next: { revalidate: 600 }` on fetch.
 */

import { GameCard, Market } from "./types";

const REVALIDATE_SEC = 600;

type OddsOutcome = { name?: string; description?: string; point?: number; price?: number };

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

/** Map Odds API / common abbreviations to the same key as full MLB.com names. */
export function teamKey(s: string): string {
  const n = normTeam(s).replace(/'/g, "'");
  if (/athletic|^a s$|^as$/.test(n)) return "athletics";
  for (const nick of MLB_NICKNAMES_DESC) {
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

/**
 * Odds API player props usually put the batter/pitcher in `description` and Over/Under in `name`.
 * Some responses flip that — resolve a single player label without using loose substring matching.
 */
function outcomePlayerLabel(o: OddsOutcome): string {
  const name = (o.name ?? "").trim();
  const desc = (o.description ?? "").trim();
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
  const map = new Map<string, { ev: Record<string, unknown>; markets: unknown[] }>();
  for (const list of lists) {
    for (const raw of list) {
      const ev = raw as { id?: string; bookmakers?: Array<{ markets?: unknown[] }> };
      const id = String(ev.id ?? "");
      if (!id) continue;
      const mk = [...(ev.bookmakers?.[0]?.markets ?? [])];
      if (!map.has(id)) map.set(id, { ev: ev as Record<string, unknown>, markets: mk });
      else map.get(id)!.markets.push(...mk);
    }
  }
  return [...map.values()].map(({ ev, markets }) => {
    const bms = (ev.bookmakers as Array<Record<string, unknown>> | undefined) ?? [];
    if (bms.length) {
      return { ...ev, bookmakers: [{ ...bms[0], markets }] };
    }
    return { ...ev, bookmakers: [{ key: "fanduel", title: "FanDuel", markets }] };
  });
}

const CORE_MARKETS =
  "h2h,spreads,totals,h2h_1st_5_innings,totals_1st_1_innings,team_totals,alternate_team_totals";
const PLAYER_MARKETS =
  "batter_hits,batter_home_runs,batter_home_runs_alternate,batter_total_bases,batter_rbis,batter_runs,pitcher_strikeouts,batter_walks";

async function logOddsApiError(res: Response, tag: string): Promise<void> {
  let body = "";
  try {
    body = (await res.text()).replace(/\s+/g, " ").slice(0, 260);
  } catch {
    body = "";
  }
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  console.error(
    `[odds-api:${tag}] status=${res.status} remaining=${remaining ?? "?"} used=${used ?? "?"} body=${body || "<empty>"}`
  );
}

export async function fetchMlbOddsEvents(): Promise<unknown[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    console.warn("[odds-api] ODDS_API_KEY missing; using model prices.");
    return [];
  }
  const base =
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds" +
    `?apiKey=${encodeURIComponent(key)}&regions=us&oddsFormat=american&bookmakers=fanduel,draftkings`;
  const allMarkets = `${CORE_MARKETS},${PLAYER_MARKETS}`;
  try {
    const res = await fetch(`${base}&markets=${allMarkets}`, { next: { revalidate: REVALIDATE_SEC } });
    if (res.ok) return (await res.json()) as unknown[];
    await logOddsApiError(res, "combined");
  } catch {
    /* fall through */
  }
  try {
    const [a, b] = await Promise.all([
      fetch(`${base}&markets=${CORE_MARKETS}`, { next: { revalidate: REVALIDATE_SEC } }),
      fetch(`${base}&markets=${PLAYER_MARKETS}`, { next: { revalidate: REVALIDATE_SEC } })
    ]);
    if (!a.ok) await logOddsApiError(a, "core");
    if (!b.ok) await logOddsApiError(b, "player");
    const ja = a.ok ? ((await a.json()) as unknown[]) : [];
    const jb = b.ok ? ((await b.json()) as unknown[]) : [];
    const merged = mergeEventsById([ja, jb]);
    if (!merged.length) {
      console.warn("[odds-api] no MLB events returned; using model prices.");
    }
    return merged;
  } catch {
    return [];
  }
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
  runs: "batter_runs",
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

    if (m.marketType.startsWith("player_")) {
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
