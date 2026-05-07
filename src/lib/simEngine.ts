import { expectedValue, fractionalKellyUnits, impliedProbabilityFromAmerican } from "./odds";
import type { PickKind } from "./playerPropCatalog";
import { explainLeg, type LegBreakdown } from "./simExplain";
import { SimResult, SlipBet } from "./types";
import type { GameHistoryContext } from "./simContext";

type SimOptions = {
  iterations?: number;
  weatherFactor?: number;
  bullpenFactor?: number;
  offenseFactor?: number;
  injuryFactor?: number;
  variance?: number;
  gameContextById?: Record<string, GameHistoryContext>;
};

export type SimulationOutput = {
  results: SimResult[];
  breakdowns: LegBreakdown[];
  parlayHitProbability: number;
  commonScores: Array<{ score: string; count: number }>;
  histogram: Array<{ runs: number; frequency: number }>;
  recommendations: {
    bestStraight: string;
    bestParlay: string;
    safest: string;
    highestUpside: string;
    highestEV: string;
  };
};

function noise(range = 0.12): number {
  return (Math.random() - 0.5) * 2 * range;
}

function clamp(n: number, min = 0.01, max = 0.99): number {
  return Math.min(max, Math.max(min, n));
}

function evaluateRisk(edge: number): "low" | "medium" | "high" {
  if (edge > 0.07) return "low";
  if (edge > 0.02) return "medium";
  return "high";
}

function confidence(hitProb: number, edge: number): number {
  const raw = hitProb * 65 + Math.max(0, edge * 300);
  return Math.min(98, Math.max(35, Math.round(raw)));
}

/** Stake tag in abstract units (not dollars); always returns a note for UI. */
function stakePlan(hitProbability: number, implied: number, american: number, edge: number): { units: number; note: string } {
  if (edge <= 0) {
    return {
      units: 0.1,
      note: "No positive edge vs the posted American price on this sim run — keep it to a micro 0.1u tracker stake."
    };
  }
  if (edge < 0.015) {
    const fk = fractionalKellyUnits(hitProbability, american, 14, 0.12);
    const units = Math.max(0.25, Math.min(0.5, fk > 0 ? fk : 0.25));
    return {
      units,
      note: "Thin edge band — quarter-to-half unit tag at most; variance can erase micro-edges quickly."
    };
  }
  const fk = fractionalKellyUnits(hitProbability, american, 8, edge > 0.08 ? 0.5 : 0.25);
  const units = Math.max(0.25, Math.min(1.5, fk > 0 ? fk : 0.25));
  if (edge > 0.08) {
    return {
      units,
      note: "Stronger edge in this run — fractional Kelly slice capped at 1.5u so one bad read does not dominate risk."
    };
  }
  return {
    units,
    note: "Moderate edge — sized with fractional Kelly vs your bankroll inputs (capped at 1.5u)."
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function inferPickKind(bet: SlipBet): PickKind {
  if (bet.pickKind) return bet.pickKind;
  const s = bet.selection;
  if (/to hit a home run \(yes\)/i.test(s)) return "yes_no";
  if (/\d+\+/.test(s) && !/\bover\b/i.test(s) && !/\bunder\b/i.test(s)) return "tier_plus";
  return "over_under";
}

function inferStatKey(bet: SlipBet): string {
  if (bet.statKey) return bet.statKey;
  const m = bet.marketType.toLowerCase();
  if (m.startsWith("player_")) return m.replace(/^player_/, "");
  return "";
}

function tierBaseline(stat: string, min: number): number {
  const tables: Record<string, Record<number, number>> = {
    hits: { 1: 0.78, 2: 0.43, 3: 0.18 },
    runs: { 1: 0.63, 2: 0.29 },
    rbi: { 1: 0.71, 2: 0.37, 3: 0.15 },
    tb: { 1: 0.76, 2: 0.47, 3: 0.25, 4: 0.11 },
    hrr: { 2: 0.58, 3: 0.33, 4: 0.14 },
    hr: { 1: 0.13 },
    walks: { 1: 0.58, 2: 0.22 },
    k: { 4: 0.57, 5: 0.43, 6: 0.28, 7: 0.17, 8: 0.08 }
  };
  const row = tables[stat];
  if (!row) return 0.38;
  return row[min] ?? 0.28;
}

function ouBaseline(stat: string, line: number, over: boolean): number {
  const L = line;
  let pOver = 0.5;
  if (stat === "hits") pOver = L <= 0.5 ? 0.76 : L <= 1.5 ? 0.44 : 0.19;
  else if (stat === "runs") pOver = L <= 0.5 ? 0.68 : 0.32;
  else if (stat === "rbi") pOver = L <= 0.5 ? 0.72 : L <= 1.5 ? 0.38 : 0.14;
  else if (stat === "tb") pOver = L <= 1.5 ? 0.52 : L <= 2.5 ? 0.32 : 0.16;
  else if (stat === "hrr") pOver = L <= 1.5 ? 0.58 : L <= 2.5 ? 0.36 : 0.17;
  else if (stat === "hr") pOver = L <= 0.5 ? 0.13 : 0.05;
  else if (stat === "walks") pOver = L <= 0.5 ? 0.55 : 0.24;
  else if (stat === "k") pOver = L <= 3.5 ? 0.62 : L <= 5.5 ? 0.45 : L <= 7.5 ? 0.26 : 0.12;
  else pOver = 0.45;
  return over ? pOver : 1 - pOver;
}

/** Per-leg baseline hit rate from market type + deterministic player variance */
function baselineHitProb(bet: SlipBet): number {
  const m = bet.marketType.toLowerCase();
  const sel = bet.selection;
  const jitter = (hashStr(bet.id + sel) % 200) / 1000; // 0..0.2

  if (m === "moneyline") return 0.45 + jitter * 0.35;
  if (m === "runline") return 0.48 + jitter * 0.2;
  if (m === "total") {
    const over = sel.toLowerCase().includes("over");
    return over ? 0.47 + jitter * 0.25 : 0.47 + jitter * 0.22;
  }
  if (m === "team_total") return 0.46 + jitter * 0.22;
  if (m === "first5") return 0.49 + jitter * 0.15;
  if (m === "yrfi") return 0.48 + jitter * 0.12;
  if (m === "nrfi") return 0.48 + jitter * 0.12;

  if (m.startsWith("player_")) {
    const stat = inferStatKey(bet);
    const pk = inferPickKind(bet);
    if (pk === "yes_no") return tierBaseline("hr", 1) + jitter * 0.12;
    if (pk === "tier_plus" && bet.tierMin != null) return tierBaseline(stat, bet.tierMin) + jitter * 0.1;
    if (pk === "over_under" && bet.line != null) {
      const over = sel.toLowerCase().includes("over");
      return ouBaseline(stat, bet.line, over) + jitter * 0.08;
    }
    if (m === "player_hits") return 0.36 + jitter * 0.2;
    if (m === "player_hr") return 0.12 + jitter * 0.15;
    if (m === "player_rbi") return 0.38 + jitter * 0.18;
    if (m === "player_tb") return 0.37 + jitter * 0.2;
    if (m === "player_hrr") return 0.39 + jitter * 0.18;
    if (m === "player_k") return 0.44 + jitter * 0.18;
    return 0.35 + jitter * 0.2;
  }
  return 0.45 + jitter * 0.2;
}

export function runSimulation1000(bets: SlipBet[], options: SimOptions = {}): SimulationOutput {
  const iterations = options.iterations ?? 1000;
  const weatherFactor = options.weatherFactor ?? 1;
  const bullpenFactor = options.bullpenFactor ?? 1;
  const offenseFactor = options.offenseFactor ?? 1;
  const injuryFactor = options.injuryFactor ?? 1;
  const variance = options.variance ?? 0.12;
  const gameCtx = options.gameContextById ?? {};

  const simulatedHits = new Map<string, number>();
  bets.forEach((b) => simulatedHits.set(b.id, 0));

  const scoreMap = new Map<string, number>();
  const totalRunsFreq = new Map<number, number>();

  for (let i = 0; i < iterations; i++) {
    const homeRuns = Math.max(0, Math.round(4.4 * offenseFactor * weatherFactor + noise(2.2)));
    const awayRuns = Math.max(0, Math.round(4.1 * (2 - bullpenFactor) * injuryFactor + noise(2.2)));
    const scoreKey = `${awayRuns}-${homeRuns}`;
    scoreMap.set(scoreKey, (scoreMap.get(scoreKey) ?? 0) + 1);
    const totalRuns = homeRuns + awayRuns;
    totalRunsFreq.set(totalRuns, (totalRunsFreq.get(totalRuns) ?? 0) + 1);

    for (const bet of bets) {
      let base = baselineHitProb(bet);
      const m = bet.marketType.toLowerCase();
      if (m === "total" && bet.line != null) {
        const over = bet.selection.toLowerCase().includes("over");
        const hitOver = totalRuns > bet.line;
        base = (over ? (hitOver ? 0.62 : 0.28) : hitOver ? 0.32 : 0.58) * 0.5 + base * 0.5;
      }

      const marketAnchor = impliedProbabilityFromAmerican(bet.oddsAmerican);
      const blended = base * 0.72 + marketAnchor * 0.28;
      const adjusted = clamp(blended * weatherFactor * (2 - injuryFactor) + noise(variance * 0.8));
      if (Math.random() < adjusted) simulatedHits.set(bet.id, (simulatedHits.get(bet.id) ?? 0) + 1);
    }
  }

  const results = bets.map((bet) => {
    const hits = simulatedHits.get(bet.id) ?? 0;
    // Laplace smoothing for less jumpy probabilities on small edges.
    const hitProbability = (hits + 1) / (iterations + 2);
    const impliedProbability = impliedProbabilityFromAmerican(bet.oddsAmerican);
    const edge = hitProbability - impliedProbability;
    const ev = expectedValue(hitProbability, bet.oddsAmerican);
    const { units, note } = stakePlan(hitProbability, impliedProbability, bet.oddsAmerican, edge);
    return {
      betId: bet.id,
      hitProbability,
      impliedProbability,
      edge,
      expectedValue: ev,
      confidenceScore: confidence(hitProbability, edge),
      risk: evaluateRisk(edge),
      suggestedUnits: units,
      suggestedUnitsNote: note
    } satisfies SimResult;
  });

  const breakdowns = bets.map((bet, idx) => explainLeg(bet, results[idx], gameCtx[bet.gameId]));

  const parlayHitProbability = results.reduce((acc, r) => acc * r.hitProbability, 1);

  const commonScores = [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([score, count]) => ({ score, count }));

  const histogram = [...totalRunsFreq.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([runs, frequency]) => ({ runs, frequency }));

  const positive = results.filter((r) => r.edge > 0).sort((a, b) => b.expectedValue - a.expectedValue);
  const bestStraight = positive[0]?.betId ?? "No positive-edge straight bet";
  const safest = [...results].sort((a, b) => b.hitProbability - a.hitProbability)[0]?.betId ?? "N/A";
  const highestUpside = [...results].sort((a, b) => b.expectedValue - a.expectedValue)[0]?.betId ?? "N/A";

  return {
    results,
    breakdowns,
    parlayHitProbability,
    commonScores,
    histogram,
    recommendations: {
      bestStraight,
      bestParlay: positive.slice(0, 2).map((r) => r.betId).join(" + ") || "No +EV parlay",
      safest,
      highestUpside,
      highestEV: highestUpside
    }
  };
}
