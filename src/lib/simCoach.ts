type SimRow = {
  betId: string;
  hitProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  confidenceScore: number;
  risk: string;
  suggestedUnits: number;
  suggestedUnitsNote?: string;
};

type LegBreakdown = {
  betId: string;
  selection: string;
  whyItCouldHit: string[];
  whyItCouldMiss: string[];
  summary: string;
  stakeGuidance: string;
};

type SimPayload = {
  bets?: unknown[];
  results: SimRow[];
  breakdowns: LegBreakdown[];
  parlayHitProbability: number;
};

type ChatMsg = {
  role: "user" | "coach";
  text: string;
};

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function buildAutoCoachIntro(payload: SimPayload): string {
  const topEdge = [...payload.results].sort((a, b) => b.edge - a.edge)[0];
  const safest = [...payload.results].sort((a, b) => b.hitProbability - a.hitProbability)[0];
  const riskiest = [...payload.results].sort((a, b) => a.hitProbability - b.hitProbability)[0];
  const avgEdge = payload.results.length
    ? payload.results.reduce((acc, x) => acc + x.edge, 0) / payload.results.length
    : 0;

  const positiveCount = payload.results.filter((x) => x.edge > 0).length;

  return [
    `I read this slip as ${positiveCount}/${payload.results.length} legs clearing simulated breakeven.`,
    `Your full parlay cash rate is around ${pct(payload.parlayHitProbability)}.`,
    topEdge ? `Best value profile is ${topEdge.betId} (${pct(topEdge.edge)} edge).` : "",
    safest ? `Safest leg is ${safest.betId} at ${pct(safest.hitProbability)} hit rate.` : "",
    riskiest ? `Highest miss-risk leg is ${riskiest.betId} at ${pct(riskiest.hitProbability)} hit rate.` : "",
    `Average edge across the ticket is ${pct(avgEdge)}; if this is a higher-variance day for you, keep stake sizes compact.`
  ]
    .filter(Boolean)
    .join(" ");
}

function findLeg(payload: SimPayload, query: string): { row: SimRow; leg?: LegBreakdown } | null {
  const q = query.toLowerCase();
  const byId = new Map(payload.breakdowns.map((x) => [x.betId, x]));
  for (const row of payload.results) {
    const leg = byId.get(row.betId);
    const text = `${row.betId} ${leg?.selection ?? ""}`.toLowerCase();
    if (text.includes(q)) return { row, leg };
  }
  return null;
}

export function respondCoachQuestion(payload: SimPayload, question: string): string {
  const q = question.trim().toLowerCase();
  if (!q) return "Ask me about safest leg, best value, what can miss, or stake sizing and I will break it down plainly.";

  if (q.includes("safest")) {
    const safest = [...payload.results].sort((a, b) => b.hitProbability - a.hitProbability)[0];
    if (!safest) return "I need at least one leg in the sim to score safety.";
    return `Safest profile is ${safest.betId} at ${pct(safest.hitProbability)} simulated hit chance. I would still treat it as variance-sensitive and keep it around ${safest.suggestedUnits}u.`;
  }

  if (q.includes("best") || q.includes("value") || q.includes("edge")) {
    const best = [...payload.results].sort((a, b) => b.edge - a.edge)[0];
    if (!best) return "No leg data found.";
    return `${best.betId} leads on value with ${pct(best.edge)} edge, ${pct(best.hitProbability)} hit rate, and EV ${best.expectedValue.toFixed(2)}u per 1u risked.`;
  }

  if (q.includes("risk") || q.includes("miss")) {
    const risky = [...payload.results].sort((a, b) => a.hitProbability - b.hitProbability)[0];
    if (!risky) return "No leg data found.";
    return `${risky.betId} is the biggest miss candidate (${pct(risky.hitProbability)} hit chance). If you keep it, consider reducing other legs or lowering total exposure.`;
  }

  if (q.includes("unit") || q.includes("stake") || q.includes("size")) {
    const totalUnits = payload.results.reduce((acc, r) => acc + Math.max(0.1, r.suggestedUnits), 0);
    return `Sizing pass: aggregate suggested exposure is ${totalUnits.toFixed(2)}u. Even thin-edge legs keep a 0.1u micro tag so you are never at 0 and can still track performance.`;
  }

  const specific = findLeg(payload, q);
  if (specific) {
    const miss = specific.leg?.whyItCouldMiss?.[0] ?? "Main risk is variance against this price.";
    const hit = specific.leg?.whyItCouldHit?.[0] ?? "Main support is simulated hit rate versus line breakeven.";
    return `${specific.leg?.selection ?? specific.row.betId}: ${pct(specific.row.hitProbability)} hit chance vs ${pct(specific.row.impliedProbability)} breakeven. ${hit} Biggest watch item: ${miss}`;
  }

  return "I could not map that to a specific leg yet. Try asking: 'safest leg', 'best value', 'what can miss', or type a leg id/player name.";
}

