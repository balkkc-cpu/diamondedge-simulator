import type { GameCard, Market } from "./types";

export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

export function impliedProbabilityFromAmerican(american: number): number {
  return american > 0 ? 100 / (american + 100) : Math.abs(american) / (Math.abs(american) + 100);
}

export function expectedValue(hitProb: number, americanOdds: number, stake = 1): number {
  const dec = americanToDecimal(americanOdds);
  const win = (dec - 1) * stake;
  const lose = stake;
  return hitProb * win - (1 - hitProb) * lose;
}

export function breakEvenProbability(americanOdds: number): number {
  return impliedProbabilityFromAmerican(americanOdds);
}

export function kellyFraction(hitProb: number, americanOdds: number): number {
  const b = americanToDecimal(americanOdds) - 1;
  const q = 1 - hitProb;
  const raw = (b * hitProb - q) / b;
  return Math.max(0, raw);
}

export function fractionalKellyUnits(hitProb: number, americanOdds: number, bankrollUnits = 10, fraction = 0.25): number {
  const k = kellyFraction(hitProb, americanOdds) * fraction;
  return Math.min(1.5, Math.round(k * bankrollUnits * 4) / 4);
}

const NON_BOOK_SOURCES = new Set(["model", "mock", ""]);

/** True when the line came from any sportsbook Odds API key (not our seed/mock numbers). source is bookmaker key like fanduel, draftkings, betmgm, etc. */
export function isSportsbookLineSource(source: string): boolean {
  if (!source || NON_BOOK_SOURCES.has(source)) return false;
  if (source === "book") return false;
  return true;
}

/** Model props use `player_hits`, etc.; The Rundown uses the umbrella type `player_prop`. */
export function isPlayerPropMarketType(marketType: string): boolean {
  const t = String(marketType ?? "").toLowerCase();
  return t === "player_prop" || t.startsWith("player_");
}

/** Drop player props that are not posted prices from a book (Odds API key or `rundown:` affiliate). */
export function filterOutNonBookPlayerProps<T extends { marketType: string; source: string }>(markets: T[]): T[] {
  return markets.filter((m) => !isPlayerPropMarketType(m.marketType) || isSportsbookLineSource(m.source));
}

function normTeamOrPlayerLabel(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

/**
 * True for markets that should appear under “player props” in the UI.
 * Filters out mis-tagged team run/spread rows (often `player_prop` + team as `playerName`).
 */
function tailAfterPlayerDot(selection: string): string {
  if (!selection.includes(" · ")) return "";
  return selection.split(" · ").slice(1).join(" · ").trim().toLowerCase();
}

export function isLegibleSportsbookPlayerProp(
  m: Market,
  game: Pick<GameCard, "homeTeam" | "awayTeam"> | null | undefined
): boolean {
  if (!isPlayerPropMarketType(m.marketType) || !isSportsbookLineSource(m.source)) return false;

  /** Shaped `player_*` rows from The Rundown affiliate feed (already normalized in ingest). */
  const rundownShaped =
    /^rundown:/i.test(String(m.source)) &&
    Boolean(m.statKey) &&
    /^player_/i.test(String(m.marketType));
  if (rundownShaped) {
    const tail = tailAfterPlayerDot(m.selection);
    const tailOk =
      Boolean(tail) &&
      ((/\bover\b|\bunder\b/.test(tail) && /\d/.test(tail)) || /\(yes\)|\(no\)/.test(tail) || /\d\s*\+\s/.test(tail));
    const pn = normTeamOrPlayerLabel(String(m.playerName ?? ""));
    if (tailOk && pn.split(/\s+/).filter(Boolean).length >= 2) {
      if (!game) return true;
      const ht = normTeamOrPlayerLabel(game.homeTeam);
      const at = normTeamOrPlayerLabel(game.awayTeam);
      return pn !== ht && pn !== at;
    }
  }

  const low = m.selection.toLowerCase();
  const tail = tailAfterPlayerDot(m.selection);
  if (m.selection.includes(" · ")) {
    if (
      (/\bover\b|\bunder\b/.test(tail) && /\d/.test(tail)) ||
      /\(yes\)|\(no\)/.test(tail) ||
      /\d\s*\+\s/.test(tail)
    ) {
      // Odds API rows: "Name · Over 0.5 Hits" — reject "Team · +1.5" style tails.
      return true;
    }
  }
  const statish =
    (/\bover\b|\bunder\b/.test(low) && /\d/.test(m.selection)) || /\(yes\)|\(no\)/.test(low) || /\d\s*\+\s/.test(low);
  if (!statish || !m.statKey) return false;
  const pn = normTeamOrPlayerLabel(String(m.playerName ?? ""));
  if (!pn) return false;
  if (game) {
    const ht = normTeamOrPlayerLabel(game.homeTeam);
    const at = normTeamOrPlayerLabel(game.awayTeam);
    if (pn === ht || pn === at) return false;
  }
  return true;
}

/** Apply {@link isLegibleSportsbookPlayerProp} to player rows; pass through all non-player markets. */
export function filterLegiblePlayerPropsForSlate(markets: Market[], games: GameCard[]): Market[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  return markets.filter((m) => {
    if (!isPlayerPropMarketType(m.marketType)) return true;
    return isLegibleSportsbookPlayerProp(m, byId.get(m.gameId));
  });
}

/** Default 24h — keeps The Odds API request volume low (override with ODDS_CACHE_SECONDS). */
const DEFAULT_ODDS_CACHE_SEC = 86_400;

/** Next.js `fetch` revalidate for Odds API responses (seconds). Min 300, max 7d. */
export function oddsApiRevalidateSeconds(): number {
  const raw = process.env.ODDS_CACHE_SECONDS ?? process.env.ODDS_REVALIDATE_SECONDS;
  if (raw == null || String(raw).trim() === "") return DEFAULT_ODDS_CACHE_SEC;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 300) return 300;
  return Math.min(Math.floor(n), 86_400 * 7);
}
