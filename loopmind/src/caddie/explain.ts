import { CaddieRecommendation, RecommendationInput } from "@/types/models";
import { skillLabel } from "@/constants/skill";
import { rewriteAsCaddie } from "@/services/openai";

/** Build the always-available, rule-based caddie explanation. */
export function buildRuleExplanation(
  input: RecommendationInput,
  rec: CaddieRecommendation,
): string {
  const parts: string[] = [];

  const windPhrase = input.weather
    ? `, wind ${input.weather.windSpeedMph} mph`
    : "";
  parts.push(
    `You've got ${input.targetYards} to the target${windPhrase}. It's playing like ${rec.playsLikeYards}.`,
  );

  if (rec.primary.label.includes("lay up")) {
    parts.push(
      `With your game, the smart play is to lay up with the ${rec.primary.clubLabel} and leave a full wedge. ${rec.targetLine}`,
    );
  } else {
    parts.push(
      `The play is the ${rec.primary.clubLabel}. ${rec.targetLine}`,
    );
  }

  parts.push(`Your safe miss: ${rec.safeMiss.toLowerCase()}`);
  parts.push(rec.expectedResult);

  return parts.join(" ");
}

/** Compact fact sheet handed to the AI layer for rewriting. */
function factSheet(input: RecommendationInput, rec: CaddieRecommendation): string {
  return [
    `Player skill: ${skillLabel(input.skillLevel)} (${input.dominantHand}-handed, ${input.shotShape}).`,
    `Distance to target: ${input.targetYards} yds; plays like ${rec.playsLikeYards} yds.`,
    `Lie: ${input.lie}. Risk tolerance: ${input.riskTolerance}.`,
    input.weather
      ? `Weather: ${input.weather.temperatureF}F, wind ${input.weather.windSpeedMph} mph.`
      : "Weather: unknown.",
    input.pinNote ? `Pin: ${input.pinNote}.` : "Pin: middle (assumed).",
    `Recommended club: ${rec.primary.clubLabel} (${rec.primary.label}).`,
    `Target line: ${rec.targetLine}`,
    `Safe miss: ${rec.safeMiss}`,
    `Expected result: ${rec.expectedResult}`,
  ].join("\n");
}

/**
 * Returns a recommendation with the explanation filled in. Tries the OpenAI
 * layer first (if configured) and falls back to the rule-based template.
 */
export async function withExplanation(
  input: RecommendationInput,
  rec: CaddieRecommendation,
): Promise<CaddieRecommendation> {
  const aiText = await rewriteAsCaddie(factSheet(input, rec));
  if (aiText) {
    return { ...rec, explanation: aiText, aiEnhanced: true };
  }
  return { ...rec, explanation: buildRuleExplanation(input, rec), aiEnhanced: false };
}
