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
  /** Short slate label, e.g. "NYY @ BOS" */
  matchup: string;
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
  /** 0–1 blend of model edge + per-leg hit strength (not the same as parlay hit %). */
  parlayQualityScore01: number;
  distinctGameCount: number;
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

function countDistinctGames(legs: SuggestedParlayLeg[]): number {
  return new Set(legs.map((l) => l.gameId)).size;
}

/** Minimum distinct games when the board actually has that many games with props. */
function requiredMinDistinctGames(targetLegs: number, uniqueGamesInPool: number): number {
  if (uniqueGamesInPool <= 1) return 1;
  if (targetLegs <= 2) return Math.min(2, uniqueGamesInPool, targetLegs);
  if (targetLegs === 3) return Math.min(2, uniqueGamesInPool);
  return Math.min(3, uniqueGamesInPool);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** 0–1 “quality” from average edge + hit rate (for UI meter, not payout odds). */
function parlayQualityScore01(legs: SuggestedParlayLeg[]): number {
  if (!legs.length) return 0;
  const meanEdge = legs.reduce((s, l) => s + l.edge, 0) / legs.length;
  const meanHit = legs.reduce((s, l) => s + l.hitProbability, 0) / legs.length;
  const edge01 = clamp01((meanEdge + 0.02) / 0.22);
  const hit01 = clamp01(meanHit);
  return clamp01(0.45 * hit01 + 0.55 * edge01);
}

/**
 * Round-robin games across leg slots (e.g. 3 legs, 2 games → A,B,A) so parlays
 * use multiple matchups instead of collapsing to one game after the first pass.
 */
function pickLegsMultiGame(
  candidates: SuggestedParlayLeg[],
  targetLegs: number,
  minHit: number,
  rng: () => number
): SuggestedParlayLeg[] {
  const pool = shuffleInPlace(
    candidates.filter((x) => x.hitProbability >= minHit),
    rng
  );
  if (!pool.length) return [];

  const byGame = new Map<string, SuggestedParlayLeg[]>();
  for (const c of pool) {
    const arr = byGame.get(c.gameId) ?? [];
    arr.push(c);
    byGame.set(c.gameId, arr);
  }
  for (const arr of byGame.values()) {
    arr.sort((a, b) => b.hitProbability - a.hitProbability);
  }

  const gameIds = shuffleInPlace([...byGame.keys()], rng);
  const usedPlayers = new Set<string>();
  const usedBets = new Set<string>();
  const out: SuggestedParlayLeg[] = [];

  const assignment: string[] = [];
  for (let i = 0; i < targetLegs; i++) {
    assignment.push(gameIds[i % gameIds.length]!);
  }

  for (const gid of assignment) {
    if (out.length >= targetLegs) break;
    let picked: SuggestedParlayLeg | undefined;
    for (const c of byGame.get(gid) ?? []) {
      if (usedBets.has(c.betId)) continue;
      const pk = playerFromSelection(c.selection);
      if (pk && usedPlayers.has(pk)) continue;
      picked = c;
      break;
    }
    if (picked) {
      usedBets.add(picked.betId);
      const pk = playerFromSelection(picked.selection);
      if (pk) usedPlayers.add(pk);
      out.push(picked);
      continue;
    }
    outer: for (const g2 of gameIds) {
      for (const c of byGame.get(g2) ?? []) {
        if (usedBets.has(c.betId)) continue;
        const pk = playerFromSelection(c.selection);
        if (pk && usedPlayers.has(pk)) continue;
        usedBets.add(c.betId);
        if (pk) usedPlayers.add(pk);
        out.push(c);
        break outer;
      }
    }
  }

  for (const c of pool) {
    if (out.length >= targetLegs) break;
    if (usedBets.has(c.betId)) continue;
    const pk = playerFromSelection(c.selection);
    if (pk && usedPlayers.has(pk)) continue;
    usedBets.add(c.betId);
    if (pk) usedPlayers.add(pk);
    out.push(c);
  }
  for (const c of pool) {
    if (out.length >= targetLegs) break;
    if (!usedBets.has(c.betId)) {
      usedBets.add(c.betId);
      out.push(c);
    }
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
  const uniqueGames = new Set(candidates.map((c) => c.gameId)).size;
  const minG = requiredMinDistinctGames(targetLegs, uniqueGames);
  const attempts = 22;
  const bundles: SuggestedParlayLeg[][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < attempts; i++) {
    const rng = createSeededRng(hashSeed([kind, String(diversitySeed), String(i), "parlay-try"]));
    const legs = pickLegsMultiGame(candidates, targetLegs, minHit, rng);
    if (legs.length < Math.min(2, targetLegs)) continue;
    if (uniqueGames >= minG && countDistinctGames(legs) < minG) continue;
    const sig = slipSignatureLegs(legs);
    if (seen.has(sig)) continue;
    seen.add(sig);
    bundles.push(legs);
  }
  if (!bundles.length) {
    const relaxRng = createSeededRng(hashSeed([kind, "fallback", String(diversitySeed)]));
    return pickLegsMultiGame(candidates, targetLegs, minHit * 0.55, relaxRng);
  }
  const diverseEnough = (legs: SuggestedParlayLeg[]) =>
    uniqueGames < minG || countDistinctGames(legs) >= minG;
  const pool = bundles.filter(diverseEnough);
  const scored = (pool.length ? pool : bundles).map((legs) => {
    const p = legs.reduce((a, x) => a * x.hitProbability, 1);
    const d = countDistinctGames(legs);
    const spreadBonus = d >= minG ? 1.1 : d >= minG - 1 && minG > 1 ? 1.0 : 0.88;
    const jitterRng = createSeededRng(hashSeed([kind, slipSignatureLegs(legs), String(diversitySeed), "jit"]));
    return { legs, w: p * spreadBonus * (0.86 + jitterRng() * 0.28) };
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
  const matchupByGameId = new Map(input.games.map((g) => [g.id, `${g.awayTeam} @ ${g.homeTeam}`]));

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
        matchup: matchupByGameId.get(b.gameId) ?? "Matchup TBD",
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
  ].map((c) => {
    const parlayHitProbability = c.legs.reduce((acc, x) => acc * x.hitProbability, 1);
    return {
      ...c,
      parlayHitProbability,
      parlayQualityScore01: parlayQualityScore01(c.legs),
      distinctGameCount: countDistinctGames(c.legs)
    };
  }) satisfies SuggestedParlayCard[];

  return cards;
}

