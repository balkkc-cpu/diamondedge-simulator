import { CaddieRecommendation, RecommendationInput } from "@/types/models";
import { skillLabel } from "@/constants/skill";
import { rewriteAsCaddie } from "@/services/openai";
import { personaForUser, seededPick } from "./persona";
import { PracticeArea } from "./practice";

export interface ExplainContext {
  /** Stable per-user seed (e.g. account email) — drives persona + phrasing. */
  seed?: string;
  /** The player's biggest weakness from recent rounds, for a personal tip. */
  weaknessArea?: PracticeArea;
  weaknessLostStrokes?: number;
  holePar?: number;
}

const WEAKNESS_TIP: Record<PracticeArea, string> = {
  putting: "leave yourself an uphill look — the putter's been costing you lately",
  approach: "center of the green is plenty — your approaches are where the strokes are hiding",
  tee: "favor the fat side off the tee; finding fairways is your fastest fix",
  chipping: "give yourself a simple chip if you miss — keep the short game stress low",
  penalties: "take the trouble completely out of play — no big numbers today",
};

function windPhrase(input: RecommendationInput): string {
  if (!input.weather) return "";
  const w = input.weather;
  if (w.windSpeedMph < 4) return "barely any wind";
  return `${w.windSpeedMph} mph wind`;
}

/** Build the always-available, personalized, varied caddie explanation. */
export function buildRuleExplanation(
  input: RecommendationInput,
  rec: CaddieRecommendation,
  ctx: ExplainContext = {},
): string {
  const seed = `${ctx.seed ?? "guest"}|${input.targetYards}|${input.lie}|${rec.primary.club}|${input.riskTolerance}`;
  const persona = personaForUser(ctx.seed);
  const opener = seededPick(persona.openers, seed + "o");
  const connector = seededPick(persona.connectors, seed + "c");
  const signoff = seededPick(persona.signoffs, seed + "s");

  const parts: string[] = [];

  // 1) Situation, in the caddie's voice.
  const wp = windPhrase(input);
  const pin = input.pinNote ?? "middle";
  parts.push(
    `${opener} You've got ${input.targetYards} to the ${pin}${wp ? `, ${wp}` : ""} — it's playing like ${rec.playsLikeYards}.`,
  );

  // 2) The club, referencing the player's own carry number from their bag.
  if (rec.primary.label.toLowerCase().includes("lay up")) {
    parts.push(
      `With your game, the smart play is to lay up with the ${rec.primary.clubLabel} and leave a full wedge. ${connector}`,
    );
  } else {
    const carry = rec.primary.carryYards;
    const carryNote = carry > 0 ? ` — that's about your ${carry}-yard club` : "";
    parts.push(`The ${rec.primary.clubLabel} is the number${carryNote}. ${rec.targetLine} ${connector}`);
  }

  // 3) Safe miss + a personalized weakness tie-in when we have round data.
  let line3 = `Miss it ${rec.safeMiss.toLowerCase()}`;
  if (ctx.weaknessArea && (ctx.weaknessLostStrokes ?? 0) > 0.3) {
    line3 += `, and ${WEAKNESS_TIP[ctx.weaknessArea]}`;
  }
  parts.push(line3.replace(/\.$/, "") + ".");

  // 4) Expected result + persona sign-off.
  parts.push(`${rec.expectedResult} ${signoff}`);

  return parts.join(" ");
}

/** Compact fact sheet handed to the AI layer (keeps the same persona + context). */
function factSheet(input: RecommendationInput, rec: CaddieRecommendation, ctx: ExplainContext): string {
  const persona = personaForUser(ctx.seed);
  return [
    `Caddie persona: ${persona.name} — ${persona.tagline}. Speak in that voice.`,
    `Player skill: ${skillLabel(input.skillLevel)} (${input.dominantHand}-handed, ${input.shotShape}).`,
    `Distance to target: ${input.targetYards} yds; plays like ${rec.playsLikeYards} yds.`,
    `Lie: ${input.lie}. Risk tolerance: ${input.riskTolerance}.`,
    input.weather ? `Weather: ${input.weather.temperatureF}F, wind ${input.weather.windSpeedMph} mph.` : "Weather: unknown.",
    input.pinNote ? `Pin: ${input.pinNote}.` : "Pin: middle (assumed).",
    `Recommended club: ${rec.primary.clubLabel} (${rec.primary.label}), the player's ~${rec.primary.carryYards}-yard club.`,
    `Target line: ${rec.targetLine}`,
    `Safe miss: ${rec.safeMiss}`,
    `Expected result: ${rec.expectedResult}`,
    ctx.weaknessArea ? `Player's recent weakness: ${ctx.weaknessArea} (losing ~${ctx.weaknessLostStrokes} shots/round). Work in one short, encouraging tip about it.` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Returns a recommendation with the explanation filled in. Tries the OpenAI
 * layer first (if configured) and falls back to the personalized rule template.
 */
export async function withExplanation(
  input: RecommendationInput,
  rec: CaddieRecommendation,
  ctx: ExplainContext = {},
): Promise<CaddieRecommendation> {
  const aiText = await rewriteAsCaddie(factSheet(input, rec, ctx));
  if (aiText) {
    return { ...rec, explanation: aiText, aiEnhanced: true };
  }
  return { ...rec, explanation: buildRuleExplanation(input, rec, ctx), aiEnhanced: false };
}
