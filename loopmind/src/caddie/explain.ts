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
  /** Changes each time you ask, so re-asking rephrases the advice. */
  nonce?: string;
}

const WEAKNESS_TIP: Record<PracticeArea, string> = {
  putting: "leave yourself an uphill look — the putter's been costing you lately",
  approach: "center of the green is plenty — your approaches are where the strokes are hiding",
  tee: "favor the fat side off the tee; finding fairways is your fastest fix",
  chipping: "give yourself a simple chip if you miss — keep the short game stress low",
  penalties: "take the trouble completely out of play — no big numbers today",
};

function windDescriptor(input: RecommendationInput): string {
  if (!input.weather) return "";
  const w = input.weather;
  if (w.windSpeedMph < 4) return "barely any wind";
  const note = w.windSpeedMph >= 14 ? "a stiff" : w.windSpeedMph >= 8 ? "a steady" : "a light";
  return `${note} ${w.windSpeedMph} mph wind`;
}

/** Which two in-bag clubs bracket the playing yardage, for "between clubs" talk. */
function bracketClubs(input: RecommendationInput, yards: number): { shorter?: string; longer?: string } {
  const bag = input.clubs
    .filter((c) => c.inBag && c.id !== "putter" && c.distanceYards > 0)
    .sort((a, b) => a.distanceYards - b.distanceYards);
  let shorter: string | undefined;
  let longer: string | undefined;
  for (const c of bag) {
    if (c.distanceYards <= yards) shorter = c.label;
    if (c.distanceYards >= yards && !longer) longer = c.label;
  }
  return { shorter, longer };
}

/** Build the always-available, personalized, dynamic caddie explanation. */
export function buildRuleExplanation(
  input: RecommendationInput,
  rec: CaddieRecommendation,
  ctx: ExplainContext = {},
): string {
  const v = `${ctx.seed ?? "guest"}|${input.targetYards}|${input.lie}|${rec.primary.club}|${input.riskTolerance}|${ctx.nonce ?? ""}`;
  const persona = personaForUser(ctx.seed);
  const opener = seededPick(persona.openers, v + "o");
  const connector = seededPick(persona.connectors, v + "c");
  const signoff = seededPick(persona.signoffs, v + "s");

  const pin = input.pinNote ?? "middle";
  const wind = windDescriptor(input);
  const carry = rec.primary.carryYards;
  const plays = rec.playsLikeYards;
  const delta = plays - input.targetYards; // + plays longer

  // 1) Situation — varied phrasings, mentioning the real adjustment when notable.
  const adjustClause =
    Math.abs(delta) >= 4
      ? ` (${delta > 0 ? "plays " + delta + " longer" : "plays " + Math.abs(delta) + " shorter"} once you factor it all in)`
      : "";
  const situationBank = [
    `${opener} You've got ${input.targetYards} to the ${pin}${wind ? `, ${wind}` : ""} — it's a ${plays}-yard shot${adjustClause}.`,
    `${opener} ${plays} is your real number here: ${input.targetYards} on the card${wind ? ` with ${wind}` : ""}${adjustClause}.`,
    `${opener} ${input.targetYards} to the ${pin}${wind ? `, ${wind}` : ""}. Played honestly that's about ${plays}${adjustClause}.`,
  ];
  const parts: string[] = [seededPick(situationBank, v + "1")];

  // 2) Club + swing feel, referencing the player's own carry and club gapping.
  if (rec.primary.label.toLowerCase().includes("lay up")) {
    const layBank = [
      `Take the trouble out of play — lay up with the ${rec.primary.clubLabel} and leave a full wedge. ${connector}`,
      `No hero stuff: ${rec.primary.clubLabel} to your favorite wedge number, then attack from there. ${connector}`,
    ];
    parts.push(seededPick(layBank, v + "2"));
  } else {
    const gap = carry > 0 ? plays - carry : 0;
    let feel: string;
    if (carry <= 0) feel = `the ${rec.primary.clubLabel} is the club`;
    else if (gap >= 6) {
      const { longer } = bracketClubs(input, plays);
      feel = longer && longer !== rec.primary.clubLabel
        ? `it's between clubs — I'd take the ${rec.primary.clubLabel} (your ${carry}) and make a confident swing rather than the ${longer}`
        : `step on the ${rec.primary.clubLabel} a touch — it's your ${carry}-yard club and you've got ${gap} to make up`;
    } else if (gap <= -6) {
      feel = `smooth ${rec.primary.clubLabel} — that's your ${carry}-yard club, so take something off it, don't force it`;
    } else {
      feel = `a stock ${rec.primary.clubLabel} — that's right at your ${carry}-yard number`;
    }
    parts.push(`The play is ${feel}. ${rec.targetLine} ${connector}`);
  }

  // 3) Safe miss + personalized weakness tie-in when we have round data.
  let line3 = `Miss it ${rec.safeMiss.toLowerCase().replace(/\.$/, "")}`;
  if (ctx.weaknessArea && (ctx.weaknessLostStrokes ?? 0) > 0.3) {
    line3 += `, and ${WEAKNESS_TIP[ctx.weaknessArea]}`;
  }
  parts.push(line3 + ".");

  // 4) Expected result + persona sign-off (occasionally swap order for variety).
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

/** Genuinely AI-generated caddie text (OpenAI or free Pollinations), or null. */
export async function aiCaddieText(
  input: RecommendationInput,
  rec: CaddieRecommendation,
  ctx: ExplainContext = {},
): Promise<string | null> {
  return rewriteAsCaddie(factSheet(input, rec, ctx));
}

/**
 * Returns a recommendation with the explanation filled in. Tries the AI layer
 * first and falls back to the personalized rule template.
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
