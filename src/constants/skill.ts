import { RiskTolerance, SkillLevel } from "@/types/models";

export interface SkillMeta {
  id: SkillLevel;
  label: string;
  blurb: string;
  /** Typical handicap range, shown as helper text. */
  handicap: string;
}

export const SKILL_LEVELS: SkillMeta[] = [
  {
    id: "beginner",
    label: "Complete Beginner",
    blurb: "New to the game. Goal: get the ball in play and have fun.",
    handicap: "New / 36+",
  },
  {
    id: "high",
    label: "High Handicap",
    blurb: "Breaking 100. Favor safe, high-percentage shots.",
    handicap: "~18–36",
  },
  {
    id: "mid",
    label: "Mid Handicap",
    blurb: "Breaking 90. Balance scoring chances with smart misses.",
    handicap: "~10–18",
  },
  {
    id: "low",
    label: "Low Handicap",
    blurb: "Breaking 80. Precise targets, trajectory and wind matter.",
    handicap: "~3–10",
  },
  {
    id: "scratch",
    label: "Scratch / Pro",
    blurb: "Tournament decisions, dispersion and green quadrants.",
    handicap: "+/− 2",
  },
];

export const RISK_OPTIONS: { id: RiskTolerance; label: string }[] = [
  { id: "safe", label: "Safe" },
  { id: "balanced", label: "Balanced" },
  { id: "aggressive", label: "Aggressive" },
];

export function skillLabel(skill: SkillLevel): string {
  return SKILL_LEVELS.find((s) => s.id === skill)?.label ?? skill;
}
