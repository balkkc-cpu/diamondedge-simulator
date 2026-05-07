import type { Market } from "./types";
import { isPlayerPropMarketType } from "./odds";

/** Affiliate id embedded in `source` as `rundown:19`. */
export function rundownAffiliateFromSource(source: string): string | null {
  const m = /^rundown:(\d+)$/i.exec(String(source ?? ""));
  return m ? m[1] : null;
}

function preferredAffiliateOrder(): string[] {
  const raw = process.env.RUNDOWN_PREFERRED_AFFILIATE_IDS?.trim() || "19,23";
  return raw.split(/[,;\s]+/).filter(Boolean);
}

/** Core sides retail books show first: ML, spread, game total. */
function retailGameLineTypes(): Set<string> {
  const raw =
    process.env.RUNDOWN_RETAIL_GAME_LINE_TYPES?.trim() ||
    process.env.RUNDOWN_GAME_LINE_MARKET_TYPES?.trim() ||
    "moneyline,runline,total";
  return new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean));
}

function isPlayerBoardMarket(m: Market): boolean {
  return isPlayerPropMarketType(m.marketType);
}

function retailDedupeKey(m: Market): string {
  return [m.gameId, m.marketType, m.line ?? "", m.selection.trim().toLowerCase()].join("\t");
}

function dedupeByPreferredAffiliate(rows: Market[], pref: string[]): Market[] {
  const byKey = new Map<string, Market[]>();
  for (const m of rows) {
    const k = retailDedupeKey(m);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(m);
  }

  const pickOne = (group: Market[]): Market => {
    const ranked = group.map((m) => {
      const aid = rundownAffiliateFromSource(m.source);
      const idx = aid != null ? pref.indexOf(aid) : -1;
      const prefRank = idx === -1 ? 1_000_000 : idx;
      return { m, prefRank };
    });
    ranked.sort((a, b) => {
      if (a.prefRank !== b.prefRank) return a.prefRank - b.prefRank;
      return String(a.m.source).localeCompare(String(b.m.source));
    });
    return ranked[0].m;
  };

  const out: Market[] = [];
  for (const g of byKey.values()) {
    out.push(pickOne(g));
  }
  return out;
}

/**
 * Rundown returns the same line once per affiliate — collapse to one row per unique selection,
 * preferring RUNDOWN_PREFERRED_AFFILIATE_IDS (default 19, 23).
 * Game-side: keeps only ML / run line / game total unless RUNDOWN_RETAIL_GAME_LINE_TYPES expands that list.
 */
export function applyRundownRetailSlate(markets: Market[]): Market[] {
  const allowed = retailGameLineTypes();
  const pref = preferredAffiliateOrder();
  const players = markets.filter(isPlayerBoardMarket);
  const nonPlayers = markets.filter((m) => !isPlayerBoardMarket(m));

  const gameLines = nonPlayers.filter((m) => allowed.has(m.marketType));
  const dedupedLines = dedupeByPreferredAffiliate(gameLines, pref);
  const dedupedPlayers = dedupeByPreferredAffiliate(players, pref);

  return [...dedupedLines, ...dedupedPlayers];
}
