/**
 * Standard retail-style player prop shapes (stat categories + O/U lines + “X+” tiers).
 * DiamondEdge original naming — not affiliated with any sportsbook.
 */

export type StatKey =
  | "hits"
  | "runs"
  | "rbi"
  | "tb"
  | "hrr"
  | "hr"
  | "k"
  | "walks"
  /** NBA (Odds API) stats — same sim / board plumbing as MLB hitter props */
  | "points"
  | "rebounds"
  | "assists"
  | "threes"
  | "pra"
  | "blocks"
  | "steals";

export type PickKind = "over_under" | "tier_plus" | "yes_no";

export const HITTER_MATRIX: Record<
  Exclude<StatKey, "k">,
  { label: string; short: string; ou: number[]; tiers: number[] }
> = {
  hits: { label: "Hits", short: "H", ou: [0.5, 1.5, 2.5], tiers: [1, 2, 3] },
  runs: { label: "Runs", short: "R", ou: [0.5, 1.5], tiers: [1, 2] },
  rbi: { label: "RBI", short: "RBI", ou: [0.5, 1.5, 2.5], tiers: [1, 2, 3] },
  tb: { label: "Total bases", short: "TB", ou: [1.5, 2.5, 3.5], tiers: [1, 2, 3, 4] },
  hrr: { label: "Runs + hits + RBI", short: "H+R+RBI", ou: [1.5, 2.5, 3.5], tiers: [2, 3, 4] },
  hr: { label: "Home run", short: "HR", ou: [0.5], tiers: [1] },
  walks: { label: "Walks", short: "BB", ou: [0.5, 1.5], tiers: [1, 2] },
  points: { label: "Points", short: "PTS", ou: [15.5, 20.5, 25.5, 30.5], tiers: [20, 25, 30] },
  rebounds: { label: "Rebounds", short: "REB", ou: [4.5, 6.5, 8.5, 10.5], tiers: [6, 8, 10] },
  assists: { label: "Assists", short: "AST", ou: [3.5, 5.5, 7.5, 9.5], tiers: [4, 6, 8] },
  threes: { label: "Made threes", short: "3PM", ou: [1.5, 2.5, 3.5, 4.5], tiers: [2, 3, 4] },
  pra: { label: "Pts + Reb + Ast", short: "PRA", ou: [25.5, 30.5, 35.5, 40.5], tiers: [30, 35, 40] },
  blocks: { label: "Blocks", short: "BLK", ou: [0.5, 1.5, 2.5], tiers: [1, 2, 3] },
  steals: { label: "Steals", short: "STL", ou: [0.5, 1.5, 2.5], tiers: [1, 2, 3] }
};

export const PITCHER_MATRIX = {
  k: { label: "Strikeouts", short: "K", ou: [3.5, 4.5, 5.5, 6.5, 7.5], tiers: [4, 5, 6, 7, 8] }
} as const;
