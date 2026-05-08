import { filterLegiblePlayerPropsForSlate, isPlayerPropMarketType, isSportsbookLineSource } from "@/lib/odds";
import { createSeededRng, hashSeed, rotateTake, shuffleInPlace } from "@/lib/parlaySampling";
import { runSimulation1000 } from "@/lib/simEngine";
import { explainLeg } from "@/lib/simExplain";
import type { GameCard, Market, SlipBet } from "@/lib/types";

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

function playerFromSelection(selection: string): string {
  const idx = selection.indexOf("·");
  const head = idx >= 0 ? selection.slice(0, idx) : selection;
  return head.trim().toLowerCase().slice(0, 56);
}

/** Picks legs with different players/games when possible; uses seeded shuffle so each refresh varies. */
function pickLegsDiverse(
  candidates: SuggestedParlayLeg[],
  targetLegs: number,
  minHit: number,
  rng: () => number
): SuggestedParlayLeg[] {
  const pool = shuffleInPlace(
    candidates.filter((x) => x.hitProbability >= minHit),
    rng
  );
  const out: SuggestedParlayLeg[] = [];
  const usedPlayers = new Set<string>();
  const usedGames = new Set<string>();

  for (const c of pool) {
    if (out.length >= targetLegs) break;
    const pk = playerFromSelection(c.selection);
    if (pk && usedPlayers.has(pk)) continue;
    if (usedGames.has(c.gameId)) continue;
    if (pk) usedPlayers.add(pk);
    usedGames.add(c.gameId);
    out.push(c);
  }
  for (const c of pool) {
    if (out.length >= targetLegs) break;
    const pk = playerFromSelection(c.selection);
    if (pk && out.some((x) => playerFromSelection(x.selection) === pk)) continue;
    out.push(c);
  }
  for (const c of pool) {
    if (out.length >= targetLegs) break;
    if (!out.some((x) => x.betId === c.betId)) out.push(c);
  }
  return out.slice(0, targetLegs);
}

function slipSignatureLegs(legs: SuggestedParlayLeg[]): string {
  return legs.map((l) => l.betId).sort().join("|");
}

/**
 * Draws many diverse candidate parlays, scores with jitter, then picks from the top band — more variety each refresh.
 */
function pickStochasticLegSet(
  candidates: SuggestedParlayLeg[],
  targetLegs: number,
  minHit: number,
  diversitySeed: number,
  kind: string
): SuggestedParlayLeg[] {
  if (!candidates.length) return [];
  const attempts = 18;
  const bundles: SuggestedParlayLeg[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < attempts; i++) {
    const rng = createSeededRng(hashSeed([kind, String(diversitySeed), String(i), "parlay-try"]));
    const legs = pickLegsDiverse(candidates, targetLegs, minHit, rng);
    if (legs.length < Math.min(2, targetLegs)) continue;
    const sig = slipSignatureLegs(legs);
    if (seen.has(sig)) continue;
    seen.add(sig);
    bundles.push(legs);
  }
  if (!bundles.length) {
    return pickLegsDiverse(
      candidates,
      targetLegs,
      minHit,
      createSeededRng(hashSeed([kind, "fallback", String(diversitySeed)]))
    );
  }
  const scored = bundles.map((legs) => {
    const p = legs.reduce((a, x) => a * x.hitProbability, 1);
    const jitterRng = createSeededRng(hashSeed([kind, slipSignatureLegs(legs), String(diversitySeed), "jit"]));
    return { legs, w: p * (0.86 + jitterRng() * 0.28) };
  });
  scored.sort((a, b) => b.w - a.w);
  const topBand = scored.slice(0, Math.min(10, scored.length));
  const pickRng = createSeededRng(hashSeed([kind, "choose", String(diversitySeed)]));
  const idx = Math.floor(pickRng() * topBand.length);
  return topBand[idx]!.legs;
}

export async function buildSuggestedParlaysFromBoard(input: {
  games: GameCard[];
  markets: Market[];
  parlayLegs?: 2 | 3 | 4;
  iterations?: number;
  /** Vary parlay makeup across page loads / API calls. */
  diversitySeed?: number;
}): Promise<SuggestedParlayCard[]> {
  const iterations = input.iterations ?? 1200;
  const parlayLegs = input.parlayLegs ?? 3;
  const diversitySeed = input.diversitySeed ?? hashSeed([String(Date.now()), String(Math.random())]);

  const board = filterLegiblePlayerPropsForSlate(
    input.markets.filter((m) => isPlayerPropMarketType(m.marketType) && isSportsbookLineSource(m.source)),
    input.games
  );
  if (!board.length) return [];

  const shuffledBoard = shuffleInPlace([...board], createSeededRng(hashSeed(["board-shuf", String(diversitySeed)])));
  const windowed = rotateTake(shuffledBoard, 200, diversitySeed);

  // Bounded for serverless: 200 legs, order changes every refresh via shuffle + rotating window.
  const slip = windowed.map(toSlipBet).filter((b) => Number.isFinite(b.oddsAmerican));

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

  const mixedScored = shuffleInPlace(
    [...enriched]
      .sort((a, b) => b.edge + b.hitProbability * 0.6 - (a.edge + a.hitProbability * 0.6))
      .slice(0, 52),
    createSeededRng(hashSeed(["mixed-shuf", String(diversitySeed)]))
  );
  const mixedLegs = pickStochasticLegSet(mixedScored, parlayLegs, 0.25, diversitySeed, "mixed");

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
      legs: pickStochasticLegSet(
        shuffleInPlace(
          [...byKind.hr].sort((a, b) => b.hitProbability - a.hitProbability).slice(0, 48),
          createSeededRng(hashSeed(["hr-shuf", String(diversitySeed)]))
        ),
        Math.min(2, parlayLegs),
        0.08,
        diversitySeed,
        "hr"
      ),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "Total bases parlay",
      kind: "bases" as const,
      legs: pickStochasticLegSet(
        shuffleInPlace(
          [...byKind.bases]
            .sort((a, b) => b.edge + b.hitProbability * 0.55 - (a.edge + a.hitProbability * 0.55))
            .slice(0, 52),
          createSeededRng(hashSeed(["bases-shuf", String(diversitySeed)]))
        ),
        parlayLegs,
        0.2,
        diversitySeed,
        "bases"
      ),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "Hits parlay",
      kind: "hits" as const,
      legs: pickStochasticLegSet(
        shuffleInPlace(
          [...byKind.hits]
            .sort((a, b) => b.edge + b.hitProbability * 0.55 - (a.edge + a.hitProbability * 0.55))
            .slice(0, 52),
          createSeededRng(hashSeed(["hits-shuf", String(diversitySeed)]))
        ),
        parlayLegs,
        0.2,
        diversitySeed,
        "hits"
      ),
      parlayHitProbability: 0,
      simContext
    },
    {
      title: "RBIs parlay",
      kind: "rbis" as const,
      legs: pickStochasticLegSet(
        shuffleInPlace(
          [...byKind.rbis]
            .sort((a, b) => b.edge + b.hitProbability * 0.55 - (a.edge + a.hitProbability * 0.55))
            .slice(0, 52),
          createSeededRng(hashSeed(["rbis-shuf", String(diversitySeed)]))
        ),
        parlayLegs,
        0.2,
        diversitySeed,
        "rbis"
      ),
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

