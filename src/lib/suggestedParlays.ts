import { runSimulation1000 } from "@/lib/simEngine";
import { explainLeg } from "@/lib/simExplain";
import type { GameCard, Market, SlipBet } from "@/lib/types";
import { buildPlayerPropMarkets } from "@/lib/rosterProps";
import { mockGames, mockMarkets } from "@/lib/mockData";

export type SuggestedParlayLeg = {
  betId: string;
  selection: string;
  marketType: string;
  gameId: string;
  hitProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  whyItCouldHit: string[];
  whyItCouldMiss: string[];
};

export type SuggestedParlayCard = {
  title: string;
  kind: "hr" | "bases" | "hits" | "rbis" | "mixed";
  legs: SuggestedParlayLeg[];
  parlayHitProbability: number;
  simContext: {
    iterations: number;
    runEnvironmentNote: string;
    mostCommonScore?: string;
    medianTotalRuns?: number;
  };
};

function classifyMarket(m: Market): "hr" | "bases" | "hits" | "rbis" | "other" {
  const mt = m.marketType.toLowerCase();
  const sk = String(m.statKey ?? "").toLowerCase();
  if (mt.includes("player_hr") || sk === "hr" || /home run/i.test(m.selection)) return "hr";
  if (mt.includes("player_tb") || sk === "tb" || /total bases/i.test(m.selection)) return "bases";
  if (mt.includes("player_hits") || sk === "hits" || /\bhits\b/i.test(m.selection)) return "hits";
  if (mt.includes("player_rbi") || sk === "rbi" || /\brbi\b/i.test(m.selection)) return "rbis";
  return "other";
}

function toSlipBet(m: Market): SlipBet {
  return {
    id: m.id,
    gameId: m.gameId,
    marketType: m.marketType,
    selection: m.selection,
    line: m.line ?? null,
    oddsAmerican: m.american,
    playerName: m.playerName,
    statKey: m.statKey,
    pickKind: m.pickKind,
    tierMin: m.tierMin ?? null
  };
}

function median(nums: number[]): number | undefined {
  if (!nums.length) return undefined;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function buildRunEnvironmentNote(games: GameCard[], simHistogram: Array<{ runs: number; frequency: number }>): string {
  const med = median(simHistogram.flatMap((x) => Array(Math.max(1, Math.round(x.frequency * 100))).fill(x.runs)));
  const withDelay = games.filter((g) => Boolean(g.delayInfo)).length;
  const noteBits: string[] = [];
  if (med != null) noteBits.push(`Sim run environment centers around ~${med.toFixed(0)} total runs (rough).`);
  if (withDelay) noteBits.push(`${withDelay} game(s) flagged with possible delay/postpone notes — volatility up.`);
  return noteBits.join(" ");
}

function pickTopLegs(
  candidates: SuggestedParlayLeg[],
  targetLegs: number,
  minHit: number
): SuggestedParlayLeg[] {
  const scored = candidates
    .filter((x) => x.hitProbability >= minHit)
    .sort((a, b) => (b.edge + b.hitProbability * 0.6) - (a.edge + a.hitProbability * 0.6));
  return scored.slice(0, Math.min(targetLegs, scored.length));
}

export async function buildSuggestedParlaysFromBoard(input: {
  games: GameCard[];
  markets: Market[];
  parlayLegs?: 2 | 3 | 4;
  iterations?: number;
}): Promise<SuggestedParlayCard[]> {
  const iterations = input.iterations ?? 1200;
  const parlayLegs = input.parlayLegs ?? 3;

  // Only use sportsbook-ish markets when present; otherwise include everything.
  let board = input.markets.filter((m) => m.marketType.startsWith("player_"));
  if (!board.length) {
    // Fallback: if ODDS_API_KEY mode returns no player markets, use roster/model
    // props so the dashboard never shows an empty "Suggested parlays" widget.
    const rosterBlocks = await Promise.all(
      input.games.map((g) => buildPlayerPropMarkets(g as any))
    );
    const rosterMarkets = rosterBlocks.flat();
    board = rosterMarkets.filter((m) => m.marketType.startsWith("player_"));
    if (!board.length) {
      // Last-resort fallback: keep the dashboard widget populated even when
      // the odds-provider returns no player props and roster market generation
      // can't run (missing team ids, etc.).
      board = mockMarkets.filter((m) => m.marketType.startsWith("player_"));
      if (!board.length) return [];
    }
  }

  // Keep it bounded for serverless: simulate top ~80 candidate legs.
  const slip = board
    .slice(0, 200)
    .map(toSlipBet)
    .filter((b) => Number.isFinite(b.oddsAmerican));

  const sim = runSimulation1000(slip, { iterations });

  const byId = new Map(sim.results.map((r) => [r.betId, r]));
  const breakdownById = new Map(sim.breakdowns.map((b) => [b.betId, b]));

  const enriched: SuggestedParlayLeg[] = slip
    .map((b) => {
      const r = byId.get(b.id);
      const bd = breakdownById.get(b.id) ?? explainLeg(b, r!);
      if (!r) return null;
      return {
        betId: b.id,
        selection: b.selection,
        marketType: b.marketType,
        gameId: b.gameId,
        hitProbability: r.hitProbability,
        impliedProbability: r.impliedProbability,
        edge: r.edge,
        expectedValue: r.expectedValue,
        whyItCouldHit: bd.whyItCouldHit,
        whyItCouldMiss: bd.whyItCouldMiss
      } satisfies SuggestedParlayLeg;
    })
    .filter(Boolean) as SuggestedParlayLeg[];

  const byKind = {
    hr: enriched.filter((x) => classifyMarket({ id: x.betId, gameId: x.gameId, marketType: x.marketType, selection: x.selection, line: null, american: 0, source: "" }) === "hr"),
    bases: enriched.filter((x) => classifyMarket({ id: x.betId, gameId: x.gameId, marketType: x.marketType, selection: x.selection, line: null, american: 0, source: "" }) === "bases"),
    hits: enriched.filter((x) => classifyMarket({ id: x.betId, gameId: x.gameId, marketType: x.marketType, selection: x.selection, line: null, american: 0, source: "" }) === "hits"),
    rbis: enriched.filter((x) => classifyMarket({ id: x.betId, gameId: x.gameId, marketType: x.marketType, selection: x.selection, line: null, american: 0, source: "" }) === "rbis")
  };

  const mixedPool = [...enriched].sort((a, b) => b.hitProbability - a.hitProbability).slice(0, 12);
  const mixedLegs = pickTopLegs(mixedPool, parlayLegs, 0.25);

  const simContext = {
    iterations,
    runEnvironmentNote: buildRunEnvironmentNote(input.games, sim.histogram),
    mostCommonScore: sim.commonScores?.[0]?.score,
    medianTotalRuns: median(sim.histogram.map((h) => h.runs))
  };

  const cards = [
    {
      title: "Home Run parlay (high payout, lower hit rate)",
      kind: "hr" as const,
      legs: pickTopLegs(byKind.hr, Math.min(2, parlayLegs), 0.08),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "Total bases parlay",
      kind: "bases" as const,
      legs: pickTopLegs(byKind.bases, parlayLegs, 0.2),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "Hits parlay",
      kind: "hits" as const,
      legs: pickTopLegs(byKind.hits, parlayLegs, 0.2),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "RBIs parlay",
      kind: "rbis" as const,
      legs: pickTopLegs(byKind.rbis, parlayLegs, 0.2),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "Mixed parlay (safer legs across the board)",
      kind: "mixed" as const,
      legs: mixedLegs,
      parlayHitProbability: 0,
      simContext
    }
  ].map((c) => ({
    ...c,
    parlayHitProbability: c.legs.reduce((acc, x) => acc * x.hitProbability, 1)
  })) satisfies SuggestedParlayCard[];

  return cards;
}

