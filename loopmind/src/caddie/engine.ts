import {
  CaddieRecommendation,
  Club,
  LieType,
  RecommendationInput,
  ShotOption,
  SkillLevel,
} from "@/types/models";
import { windEffect } from "@/services/weather";

/** How aggressively each skill level should attack pins / carries. */
const SKILL_AGGRESSION: Record<SkillLevel, number> = {
  beginner: 0.15,
  high: 0.3,
  mid: 0.5,
  low: 0.72,
  scratch: 0.9,
};

/** Extra yards of "club up" bias for less consistent players (avoid coming up short). */
const SKILL_CLUB_UP: Record<SkillLevel, number> = {
  beginner: 8,
  high: 6,
  mid: 3,
  low: 1,
  scratch: 0,
};

/** Lie penalties — distance the ball will typically come up short / lose. */
const LIE_PENALTY: Record<LieType, number> = {
  tee: 0,
  fairway: 0,
  rough: 8,
  bunker: 14,
  recovery: 25,
  green: 0,
};

function bagClubs(clubs: Club[]): Club[] {
  return clubs
    .filter((c) => c.inBag && c.id !== "putter" && c.distanceYards > 0)
    .sort((a, b) => b.distanceYards - a.distanceYards);
}

/** Closest club to a target yardage. */
function clubFor(clubs: Club[], yards: number): Club {
  const bag = bagClubs(clubs);
  if (bag.length === 0) {
    return { id: "7iron", label: "7 Iron", distanceYards: yards, inBag: true };
  }
  return bag.reduce((best, c) =>
    Math.abs(c.distanceYards - yards) < Math.abs(best.distanceYards - yards) ? c : best,
  );
}

function tempEffect(temperatureF: number | undefined, targetYards: number): number {
  if (temperatureF === undefined) return 0;
  // Colder air is denser => ball flies shorter => plays longer (positive delta).
  return Math.round(((70 - temperatureF) / 10) * (targetYards / 150) * 2);
}

function option(label: string, club: Club, description: string): ShotOption {
  return {
    label,
    club: club.id,
    clubLabel: club.label,
    carryYards: club.distanceYards,
    description,
  };
}

function aimSide(shotShape: RecommendationInput["shotShape"], hand: RecommendationInput["dominantHand"]) {
  // A right-handed draw moves right-to-left, so aim right of target, etc.
  if (shotShape === "straight") return null;
  const rightie = hand === "right";
  if (shotShape === "draw") return rightie ? "right" : "left";
  return rightie ? "left" : "right"; // fade
}

export function recommendShot(input: RecommendationInput): CaddieRecommendation {
  const notes: string[] = [];

  const wind = windEffect(input.weather, input.targetYards);
  const elevation = input.elevationChangeYards ?? 0; // + uphill => plays longer
  const temp = tempEffect(input.weather?.temperatureF, input.targetYards);
  const liePenalty = LIE_PENALTY[input.lie];

  const playsLikeYards = Math.max(
    20,
    Math.round(input.targetYards + wind.yardsDelta + elevation + temp + liePenalty),
  );

  if (wind.yardsDelta !== 0) {
    notes.push(`Wind (${wind.label}) ${wind.yardsDelta > 0 ? "adds" : "takes off"} ~${Math.abs(wind.yardsDelta)} yds.`);
  }
  if (elevation !== 0) {
    notes.push(`${elevation > 0 ? "Uphill" : "Downhill"} plays ${Math.abs(elevation)} yds ${elevation > 0 ? "longer" : "shorter"}.`);
  }
  if (temp !== 0) {
    notes.push(`Temperature adjustment ${temp > 0 ? "+" : ""}${temp} yds.`);
  }
  if (liePenalty > 0) {
    notes.push(`From the ${input.lie}, expect ~${liePenalty} yds less — take more club.`);
  }

  const aggression = SKILL_AGGRESSION[input.skillLevel];
  const clubUp = SKILL_CLUB_UP[input.skillLevel];

  // Primary target the engine plays to. Less skilled players aim at the
  // middle/fat of the green and effectively take a touch more club.
  const primaryYards = playsLikeYards + clubUp;
  const primaryClub = clubFor(input.clubs, primaryYards);

  // Conservative: middle of green, never short-side; take enough club.
  const conservativeClub = clubFor(input.clubs, playsLikeYards + clubUp + 4);
  // Aggressive: attack the number / pin; trust the carry.
  const aggressiveClub = clubFor(input.clubs, playsLikeYards - 2);

  // Forced-carry safety check for less consistent players.
  let forcedCarryWarning = false;
  if (input.forcedCarryYards && input.forcedCarryYards > 0) {
    const longest = bagClubs(input.clubs)[0]?.distanceYards ?? 0;
    const comfortableCarry = longest * (0.78 + aggression * 0.12);
    if (input.forcedCarryYards > comfortableCarry) {
      forcedCarryWarning = true;
      notes.push(
        `Forced carry of ${input.forcedCarryYards} yds is at the edge of your range — laying up is the percentage play.`,
      );
    }
  }

  const aim = aimSide(input.shotShape, input.dominantHand);
  const pin = input.pinNote;

  // Target line.
  let targetLine: string;
  if (forcedCarryWarning) {
    targetLine = "Lay up short of the trouble to your favorite full-swing number, then attack with a wedge.";
  } else if (input.skillLevel === "beginner" || input.skillLevel === "high") {
    targetLine = "Aim at the fat of the green (center). Take the boring, safe line.";
  } else if (pin === "left" || pin === "right") {
    const guardedSide = pin;
    targetLine = `Start it at the center and let it drift toward the ${guardedSide} pin only if your shot shape allows — otherwise center is plenty.`;
  } else if (aim) {
    targetLine = `Aim slightly ${aim} of the flag and let your natural ${input.shotShape} bring it back to center-${pin ?? "middle"}.`;
  } else {
    targetLine = `Pick a specific target center-${pin ?? "middle"} of the green and commit.`;
  }

  // Safe miss.
  let safeMiss: string;
  if (input.lie === "green") {
    safeMiss = "Below the hole — never leave yourself a slick downhill putt.";
  } else if (pin === "back") {
    safeMiss = "Short and center. Long is usually dead.";
  } else if (pin === "front") {
    safeMiss = "Pin-high to slightly long center. Short brings the front trouble into play.";
  } else {
    safeMiss = "Center of the green. A 25-foot putt beats short-siding yourself every time.";
  }

  // Expected result, by skill + lie.
  const expectedResult = buildExpectedResult(input.skillLevel, input.lie, input.targetYards, forcedCarryWarning);

  const primaryOption: ShotOption = forcedCarryWarning
    ? option("Smart play — lay up", clubFor(input.clubs, (input.forcedCarryYards ?? primaryYards) - 30), "Take the trouble out of play and wedge it close.")
    : option("Smart play", primaryClub, `Plays like ${playsLikeYards} yds. Center-green target.`);

  const conservative = option(
    "Conservative",
    conservativeClub,
    "One extra club, swing smooth, aim center. Lowest score of trouble.",
  );
  const aggressive = option(
    "Aggressive",
    aggressiveClub,
    "Flag-hunting line. Only if the miss isn't penal and you're swinging well.",
  );

  return {
    primary: primaryOption,
    conservative,
    aggressive,
    targetLine,
    safeMiss,
    expectedResult,
    explanation: "", // filled by explain.ts (rule-based or AI)
    playsLikeYards,
    aiEnhanced: false,
    notes,
  };
}

function buildExpectedResult(
  skill: SkillLevel,
  lie: LieType,
  yards: number,
  layup: boolean,
): string {
  if (layup) return "Stress-free bogey avoidance with a great look at par after the wedge.";
  const longShot = yards > 190;
  switch (skill) {
    case "beginner":
      return longShot
        ? "Goal is simply solid contact and moving it forward — anywhere near the green is a win."
        : "A good chance to find the green or the fringe with a smooth, balanced swing.";
    case "high":
      return longShot
        ? "Advance it to a comfortable wedge distance; green-or-fringe is a bonus."
        : "Green in regulation is realistic with center-of-face contact.";
    case "mid":
      return "Expect the green or just off it — two-putt par is the realistic target.";
    case "low":
      return "Green in regulation with a makeable look if you start it on line.";
    case "scratch":
      return "GIR in the correct quadrant with a controlled trajectory and tour-level dispersion.";
  }
}
