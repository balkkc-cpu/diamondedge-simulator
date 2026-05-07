/**
 * FanDuel (and fallbacks) via The Odds API — requires ODDS_API_KEY.
 * Cached 10 minutes via `next: { revalidate: 600 }` on fetch.
 */

import { GameCard, Market } from "./types";

const REVALIDATE_SEC = 600;

type OddsOutcome = { name?: string; description?: string; point?: number; price?: number };

function normTeam(s: string): string {
  return s.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
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

function teamsMatch(a: string, b: string): boolean {
  return normTeam(a) === normTeam(b);
}

export function findGameForEvent(event: { home_team?: string; away_team?: string }, games: GameCard[]): GameCard | undefined {
  return games.find(
    (g) => teamsMatch(g.homeTeam, event.home_team ?? "") && teamsMatch(g.awayTeam, event.away_team ?? "")
  );
}

function getFanduelBook(event: { bookmakers?: Array<{ key?: string; markets?: unknown[] }> }) {
  const bms = event.bookmakers ?? [];
  return bms.find((b) => b.key === "fanduel") ?? bms[0];
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

export async function fetchMlbOddsEvents(): Promise<unknown[]> {
  const key = process.env.ODDS_API_KEY;
  if (!key) return [];
  const base =
    "https://api.the-odds-api.com/v4/sports/baseball_mlb/odds" +
    `?apiKey=${encodeURIComponent(key)}&regions=us&oddsFormat=american&bookmakers=fanduel`;
  const allMarkets =
    "h2h,spreads,totals,batter_hits,batter_home_runs,batter_home_runs_alternate,batter_total_bases,batter_rbis,batter_runs,pitcher_strikeouts,batter_walks";
  try {
    const res = await fetch(`${base}&markets=${allMarkets}`, { next: { revalidate: REVALIDATE_SEC } });
    if (res.ok) return (await res.json()) as unknown[];
  } catch {
    /* fall through */
  }
  try {
    const [a, b] = await Promise.all([
      fetch(`${base}&markets=h2h,spreads,totals`, { next: { revalidate: REVALIDATE_SEC } }),
      fetch(
        `${base}&markets=batter_hits,batter_home_runs,batter_home_runs_alternate,batter_total_bases,batter_rbis,batter_runs,pitcher_strikeouts,batter_walks`,
        {
          next: { revalidate: REVALIDATE_SEC }
        }
      )
    ]);
    const ja = a.ok ? ((await a.json()) as unknown[]) : [];
    const jb = b.ok ? ((await b.json()) as unknown[]) : [];
    return mergeEventsById([ja, jb]);
  } catch {
    return [];
  }
}

function marketList(ev: Record<string, unknown>): unknown[] {
  const book = getFanduelBook(ev as { bookmakers?: Array<{ markets?: unknown[] }> });
  return book?.markets ?? [];
}

function parseH2hOutcomes(markets: unknown[]): OddsOutcome[] {
  const m = (markets as Array<{ key?: string; outcomes?: OddsOutcome[] }>).find((x) => x.key === "h2h");
  return m?.outcomes ?? [];
}

function parseTotals(markets: unknown[]): OddsOutcome[] {
  const m = (markets as Array<{ key?: string; outcomes?: OddsOutcome[] }>).find((x) => x.key === "totals");
  return m?.outcomes ?? [];
}

function parseSpreads(markets: unknown[]): OddsOutcome[] {
  const m = (markets as Array<{ key?: string; outcomes?: OddsOutcome[] }>).find((x) => x.key === "spreads");
  return m?.outcomes ?? [];
}

function parsePlayerMarket(markets: unknown[], key: string): OddsOutcome[] {
  const m = (markets as Array<{ key?: string; outcomes?: OddsOutcome[] }>).find((x) => x.key === key);
  return m?.outcomes ?? [];
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
    // FanDuel / Odds API expose HR “to hit” as Over 0.5 (or 0) on batter_home_runs — mirror that here.
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

export function mergeFanDuelPrices(markets: Market[], games: GameCard[], events: unknown[]): Market[] {
  if (!events.length) return markets;
  return markets.map((m) => {
    const game = games.find((g) => g.id === m.gameId);
    if (!game) return m;
    const ev = events.find((e) => findGameForEvent(e as { home_team: string; away_team: string }, games)?.id === game.id) as
      | Record<string, unknown>
      | undefined;
    if (!ev) return m;
    const mkts = marketList(ev);

    if (m.marketType === "moneyline") {
      for (const o of parseH2hOutcomes(mkts)) {
        if (teamsMatch(o.name ?? "", m.selection) && typeof o.price === "number") {
          return { ...m, american: o.price, source: "fanduel" };
        }
      }
      return m;
    }

    if (m.marketType === "runline") {
      const homeSlug = game.homeTeam.split(" ").pop() ?? game.homeTeam;
      const awaySlug = game.awayTeam.split(" ").pop() ?? game.awayTeam;
      for (const o of parseSpreads(mkts)) {
        if (typeof o.price !== "number" || o.point == null || m.line == null) continue;
        if (Math.abs(o.point - m.line) > 0.05) continue;
        const onHome = teamsMatch(o.name ?? "", game.homeTeam);
        const onAway = teamsMatch(o.name ?? "", game.awayTeam);
        if (onHome && m.selection.startsWith(homeSlug)) return { ...m, american: o.price, source: "fanduel", line: o.point };
        if (onAway && m.selection.startsWith(awaySlug)) return { ...m, american: o.price, source: "fanduel", line: o.point };
      }
      return m;
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
        if (typeof o.price === "number") return { ...m, american: o.price, source: "fanduel" };
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
      const exact = matches.find((o) => normPlayerName(outcomePlayerLabel(o)) === normPlayerName(m.playerName ?? m.selection.split(" · ")[0] ?? ""));
      const pick = exact ?? matches[0];
      if (pick && typeof pick.price === "number") {
        if (m.line == null && pick.point != null && pickKind(m) === "yes_no") {
          return { ...m, american: pick.price, source: "fanduel", line: pick.point };
        }
        return { ...m, american: pick.price, source: "fanduel" };
      }
    }
    return m;
  });
}
