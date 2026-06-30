import { Club, ClubId, SkillLevel } from "@/types/models";

interface ClubMeta {
  id: ClubId;
  label: string;
}

/** Full ordered bag, longest to shortest (putter last). */
export const CLUB_ORDER: ClubMeta[] = [
  { id: "driver", label: "Driver" },
  { id: "3wood", label: "3 Wood" },
  { id: "5wood", label: "5 Wood" },
  { id: "3hybrid", label: "3 Hybrid" },
  { id: "4hybrid", label: "4 Hybrid" },
  { id: "3iron", label: "3 Iron" },
  { id: "4iron", label: "4 Iron" },
  { id: "5iron", label: "5 Iron" },
  { id: "6iron", label: "6 Iron" },
  { id: "7iron", label: "7 Iron" },
  { id: "8iron", label: "8 Iron" },
  { id: "9iron", label: "9 Iron" },
  { id: "pw", label: "Pitching Wedge" },
  { id: "gw", label: "Gap Wedge" },
  { id: "sw", label: "Sand Wedge" },
  { id: "lw", label: "Lob Wedge" },
  { id: "putter", label: "Putter" },
];

export const CLUB_LABEL: Record<ClubId, string> = CLUB_ORDER.reduce(
  (acc, c) => {
    acc[c.id] = c.label;
    return acc;
  },
  {} as Record<ClubId, string>,
);

/**
 * Default average distances (yards) by skill level. These are reasonable
 * real-world averages used for the "I don't know my distances" path and as
 * the starting point a player can tune later.
 */
const DEFAULT_DISTANCES: Record<SkillLevel, Partial<Record<ClubId, number>>> = {
  beginner: {
    driver: 180,
    "3wood": 165,
    "5wood": 150,
    "4hybrid": 140,
    "5iron": 130,
    "6iron": 120,
    "7iron": 110,
    "8iron": 100,
    "9iron": 90,
    pw: 80,
    gw: 65,
    sw: 50,
    putter: 0,
  },
  high: {
    driver: 215,
    "3wood": 195,
    "5wood": 180,
    "4hybrid": 170,
    "5iron": 160,
    "6iron": 150,
    "7iron": 140,
    "8iron": 130,
    "9iron": 118,
    pw: 105,
    gw: 90,
    sw: 70,
    lw: 55,
    putter: 0,
  },
  mid: {
    driver: 245,
    "3wood": 225,
    "5wood": 210,
    "3hybrid": 205,
    "4hybrid": 195,
    "5iron": 180,
    "6iron": 170,
    "7iron": 158,
    "8iron": 145,
    "9iron": 132,
    pw: 118,
    gw: 102,
    sw: 85,
    lw: 65,
    putter: 0,
  },
  low: {
    driver: 270,
    "3wood": 250,
    "5wood": 235,
    "3hybrid": 225,
    "4iron": 210,
    "5iron": 198,
    "6iron": 185,
    "7iron": 172,
    "8iron": 158,
    "9iron": 145,
    pw: 130,
    gw: 113,
    sw: 95,
    lw: 75,
    putter: 0,
  },
  scratch: {
    driver: 290,
    "3wood": 268,
    "5wood": 250,
    "3iron": 230,
    "4iron": 218,
    "5iron": 205,
    "6iron": 192,
    "7iron": 178,
    "8iron": 164,
    "9iron": 150,
    pw: 136,
    gw: 120,
    sw: 102,
    lw: 82,
    putter: 0,
  },
};

/**
 * Build a default bag for a skill level. Clubs without a default distance for
 * that level are excluded from the bag (player can add them later).
 */
export function buildDefaultBag(skill: SkillLevel): Club[] {
  const distances = DEFAULT_DISTANCES[skill];
  return CLUB_ORDER.filter((c) => distances[c.id] !== undefined).map((c) => ({
    id: c.id,
    label: c.label,
    distanceYards: distances[c.id] ?? 0,
    inBag: true,
  }));
}

/** Default skill level used before the user picks one. */
export const DEFAULT_SKILL: SkillLevel = "mid";
