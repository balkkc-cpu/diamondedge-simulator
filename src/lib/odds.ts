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
/** Books / feeds mix middle dot, bullet, and spacing — normalize before parsing. */
function normalizePropSeparators(selection: string): string {
  return String(selection ?? "")
    .replace(/\s*[·•]\s*/g, " · ")
    .replace(/\s+/g, " ")
    .trim();
}

function tailAfterPlayerDot(selection: string): string {
  const norm = normalizePropSeparators(selection);
  if (!norm.includes(" · ")) return "";
  return norm.split(" · ").slice(1).join(" · ").trim().toLowerCase();
}

function selectionLooksLikeStatPlayerProp(selection: string): boolean {
  const norm = normalizePropSeparators(selection);
  const low = norm.toLowerCase();
  const tail = tailAfterPlayerDot(norm);
  if (norm.includes(" · ")) {
    if (
      (/\bover\b|\bunder\b/.test(tail) && /\d/.test(tail)) ||
      /\(yes\)|\(no\)/.test(tail) ||
      /\d\s*\+\s/.test(tail)
    ) {
      return true;
    }
  }
  return (
    (/\bover\b|\bunder\b/.test(low) && /\d/.test(norm)) || /\(yes\)|\(no\)/.test(low) || /\d\s*\+\s/.test(low)
  );
}

/** When `playerName` is blank, take text before Over/Under / tier / HR yes-no. */
function probablePlayerNameFromSelection(selection: string): string {
  const norm = normalizePropSeparators(selection);
  const hr = norm.match(/^(.+?)\s+·\s+to hit a home run\s*\(/i);
  if (hr) return hr[1]!.trim();
  const ou = norm.match(/^(.+?)\s+·\s+(over|under)\s+/i);
  if (ou) return ou[1]!.trim();
  const loose = norm.match(/^(.+?)\s+(over|under)\s+\d/i);
  return loose?.[1]?.trim() ?? "";
}

export function isLegibleSportsbookPlayerProp(
  m: Market,
  game: Pick<GameCard, "homeTeam" | "awayTeam"> | null | undefined
): boolean {
  if (!isPlayerPropMarketType(m.marketType) || !isSportsbookLineSource(m.source)) return false;

  const sel = normalizePropSeparators(m.selection);

  /** Shaped player rows from The Rundown feed (`rundown` or `rundown:bookId`, `player_*` or umbrella `player_prop`). */
  const src = String(m.source ?? "").toLowerCase();
  const rundownShaped =
    (src === "rundown" || /^rundown:/i.test(String(m.source))) &&
    Boolean(m.statKey) &&
    (m.marketType === "player_prop" || /^player_/i.test(String(m.marketType)));
  if (rundownShaped) {
    const tail = tailAfterPlayerDot(sel);
    const tailOk =
      Boolean(tail) &&
      ((/\bover\b|\bunder\b/.test(tail) && /\d/.test(tail)) || /\(yes\)|\(no\)/.test(tail) || /\d\s*\+\s/.test(tail));
    let pn = normTeamOrPlayerLabel(String(m.playerName ?? ""));
    if (pn.split(/\s+/).filter(Boolean).length < 2) {
      pn = normTeamOrPlayerLabel(probablePlayerNameFromSelection(sel));
    }
    if (tailOk && pn.split(/\s+/).filter(Boolean).length >= 2) {
      if (!game) return true;
      const ht = normTeamOrPlayerLabel(game.homeTeam);
      const at = normTeamOrPlayerLabel(game.awayTeam);
      return pn !== ht && pn !== at;
    }
  }

  const tail = tailAfterPlayerDot(sel);
  if (sel.includes(" · ")) {
    if (
      (/\bover\b|\bunder\b/.test(tail) && /\d/.test(tail)) ||
      /\(yes\)|\(no\)/.test(tail) ||
      /\d\s*\+\s/.test(tail)
    ) {
      let pn = normTeamOrPlayerLabel(String(m.playerName ?? ""));
      if (pn.split(/\s+/).filter(Boolean).length < 2) {
        pn = normTeamOrPlayerLabel(probablePlayerNameFromSelection(sel));
      }
      if (!pn || pn.split(/\s+/).filter(Boolean).length < 2) return false;
      if (game) {
        const ht = normTeamOrPlayerLabel(game.homeTeam);
        const at = normTeamOrPlayerLabel(game.awayTeam);
        if (pn === ht || pn === at) return false;
      }
      return true;
    }
  }
  const statish = selectionLooksLikeStatPlayerProp(sel);
  if (!statish || !m.statKey) return false;
  let pn = normTeamOrPlayerLabel(String(m.playerName ?? ""));
  if (pn.split(/\s+/).filter(Boolean).length < 2) {
    pn = normTeamOrPlayerLabel(probablePlayerNameFromSelection(sel));
  }
  if (!pn || pn.split(/\s+/).filter(Boolean).length < 2) return false;
  if (game) {
    const ht = normTeamOrPlayerLabel(game.homeTeam);
    const at = normTeamOrPlayerLabel(game.awayTeam);
    if (pn === ht || pn === at) return false;
  }
  return true;
}

/** Player props: sportsbook-priced rows only (Odds API keys, `rundown:*` affiliates, etc.). */
export function filterLegiblePlayerPropsForSlate(markets: Market[], games: GameCard[]): Market[] {
  const byId = new Map(games.map((g) => [g.id, g]));
  return markets.filter((m) => {
    if (!isPlayerPropMarketType(m.marketType)) return true;
    const g = byId.get(m.gameId);
    if (isSportsbookLineSource(m.source)) return isLegibleSportsbookPlayerProp(m, g);
    return false;
  });
}

/**
 * Player-prop pool for parlay/coach generators: legible sportsbook props first,
 * then model/mock props when feeds are empty or rate-limited (simulation-only).
 */
export function playerPropPoolForGenerators(markets: Market[], games: GameCard[]): Market[] {
  const book = filterLegiblePlayerPropsForSlate(
    markets.filter((m) => isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source)),
    games
  );
  if (book.length) return book;
  return markets.filter(
    (m) =>
      isPlayerPropMarketType(m.marketType) &&
      (m.source === "model" || m.source === "mock") &&
      Number.isFinite(m.american) &&
      String(m.selection ?? "").length > 4
  );
}

/** Default 60s for near-real-time board updates (override with ODDS_CACHE_SECONDS). */
const DEFAULT_ODDS_CACHE_SEC = 60;

/** Next.js `fetch` revalidate for Odds API responses (seconds). Min 15, max 7d. */
export function oddsApiRevalidateSeconds(): number {
  const raw = process.env.ODDS_CACHE_SECONDS ?? process.env.ODDS_REVALIDATE_SECONDS;
  if (raw == null || String(raw).trim() === "") return DEFAULT_ODDS_CACHE_SEC;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 15) return 15;
  return Math.min(Math.floor(n), 86_400 * 7);
}
