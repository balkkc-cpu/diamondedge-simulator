import { SlipBet } from "./types";
import type { SimResult } from "./types";

export type LegBreakdown = {
  betId: string;
  selection: string;
  whyItCouldHit: string[];
  whyItCouldMiss: string[];
  summary: string;
  stakeGuidance: string;
};

export function explainLeg(bet: SlipBet, r: SimResult): LegBreakdown {
  const hit = r.hitProbability;
  const imp = r.impliedProbability;
  const edge = r.edge;
  const ev = r.expectedValue;

  const whyHit: string[] = [];
  const whyMiss: string[] = [];

  if (hit > imp) {
    whyHit.push(`In this sim run, the pick cleared more often (${(hit * 100).toFixed(1)}%) than the line’s breakeven rate (${(imp * 100).toFixed(1)}%).`);
  } else {
    whyMiss.push(`Simulated hit rate (${(hit * 100).toFixed(1)}%) sits below breakeven implied by the price (${(imp * 100).toFixed(1)}%).`);
  }

  if (bet.marketType.startsWith("player_")) {
    whyHit.push("Player legs swing on matchup, lineup spot, and game script — sim injects variance around those factors.");
    whyMiss.push("Cold stretches, platoon sits, or early hook for the starter can crater a player prop even when the median looks fine.");
  } else {
    whyHit.push("Game-line sim blends run environment, bullpen usage proxy, and score variance.");
    whyMiss.push("One weird inning or a bullpen meltdown can flip a side/total quickly — that tail risk shows up in the hit-rate spread.");
  }

  if (edge > 0.03) whyHit.push(`Positive edge (~${(edge * 100).toFixed(1)} pts) vs implied probability suggests the sim sees modest value at this price.`);
  if (edge < -0.03) whyMiss.push(`Negative edge (~${(edge * 100).toFixed(1)} pts) means the posted price looks sharper than the sim’s fair view in this run.`);

  const summary = `EV about ${ev.toFixed(2)} units per 1 risked (sim only). Confidence score ${r.confidenceScore}/100 with ${r.risk} risk tag.`;

  const stakeGuidance =
    r.suggestedUnits > 0
      ? `Suggested stake tag: ${r.suggestedUnits} unit(s). ${r.suggestedUnitsNote ?? ""}`.trim()
      : `Suggested stake tag: 0 units. ${r.suggestedUnitsNote ?? "Simulation did not support a positive-edge stake size on this run."}`.trim();

  return {
    betId: r.betId,
    selection: bet.selection,
    whyItCouldHit: whyHit,
    whyItCouldMiss: whyMiss,
    summary,
    stakeGuidance
  };
}
