export type GameCard = {
  id: string;
  startTime: string;
  status: string;
  homeTeam: string;
  awayTeam: string;
  weather: string;
  ballpark?: string;
  probablePitchers?: string;
  homeTeamId?: number;
  awayTeamId?: number;
  /** Rain delay / start delay text when MLB feed reports it */
  delayInfo?: string | null;
};

import type { PickKind, StatKey } from "./playerPropCatalog";

export type Market = {
  id: string;
  gameId: string;
  marketType: string;
  selection: string;
  line: number | null;
  american: number;
  source: string;
  /** Grouping for board UI + simulation */
  playerName?: string;
  statKey?: StatKey;
  pickKind?: PickKind;
  /** For “2+ hits” style picks, minimum count to clear */
  tierMin?: number | null;
  /** The Rundown market_id when propagates from that feed */
  rundownMarketId?: number;
  /** Retail-style prop key (snake_case), derived from Rundown names — not a sportsbook API */
  bookPropCode?: string;
};

export type SlipBet = {
  id: string;
  gameId: string;
  marketType: string;
  selection: string;
  line?: number | null;
  oddsAmerican: number;
  playerName?: string;
  statKey?: StatKey;
  pickKind?: PickKind;
  tierMin?: number | null;
};

export type SimResult = {
  betId: string;
  hitProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  confidenceScore: number;
  risk: "low" | "medium" | "high";
  suggestedUnits: number;
  /** Human-readable stake guidance */
  suggestedUnitsNote?: string;
};

export type PlayerCard = {
  name: string;
  team: string;
  position: string;
  batsOrThrows: string;
  opsOrEra: string;
  recentForm: string;
};

export type GameDetail = {
  gameId: string;
  matchup: string;
  venue: string;
  weather: string;
  trends: string[];
  injuries: string[];
  starters: string[];
  projectedLineups: Record<string, string[]>;
  playersToWatch: PlayerCard[];
};
