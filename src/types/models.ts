/**
 * Core domain models for LoopMind. These mirror the Supabase schema in
 * `supabase/schema.sql` so the same shapes flow from DB -> store -> UI.
 */

export type SkillLevel = "beginner" | "high" | "mid" | "low" | "scratch";

export type DominantHand = "right" | "left";

export type ShotShape = "straight" | "draw" | "fade";

export type RiskTolerance = "safe" | "balanced" | "aggressive";

export type LieType = "tee" | "fairway" | "rough" | "bunker" | "recovery" | "green";

/** Canonical club identifiers used across the app. */
export type ClubId =
  | "driver"
  | "3wood"
  | "5wood"
  | "7wood"
  | "9wood"
  | "2hybrid"
  | "3hybrid"
  | "4hybrid"
  | "5hybrid"
  | "6hybrid"
  | "2iron"
  | "3iron"
  | "4iron"
  | "5iron"
  | "6iron"
  | "7iron"
  | "8iron"
  | "9iron"
  | "pw"
  | "gw"
  | "aw"
  | "sw"
  | "lw"
  | "60w"
  | "putter";

export interface Club {
  id: ClubId;
  label: string;
  /** Average total carry+roll distance in yards. */
  distanceYards: number;
  /** Whether the player currently has this club in the bag. */
  inBag: boolean;
}

export interface PlayerProfile {
  skillLevel: SkillLevel;
  dominantHand: DominantHand;
  shotShape: ShotShape;
  /** "I don't know my distances" => beginner defaults were applied. */
  usesDefaultDistances: boolean;
  clubs: Club[];
  onboardingComplete: boolean;
}

/** Simplified 2D coordinate (0..1 normalized within the hole canvas). */
export interface Point {
  x: number;
  y: number;
}

/** Real-world coordinate (WGS84). Used for live GPS + satellite maps. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TeeBox {
  id: string;
  name: string;
  color: string;
  /** Total hole length from this tee, in yards. */
  yards: number;
  /** Position on the normalized hole canvas. */
  position: Point;
  /** Real-world position (present for OSM / geo-located courses). */
  geo?: GeoPoint;
}

export type HazardKind = "water" | "bunker" | "ob" | "trees";

export interface Hazard {
  id: string;
  kind: HazardKind;
  label: string;
  /** Carry distance (yards from the selected tee) to clear the hazard. */
  carryYards: number;
  position: Point;
  /** Real-world position (present for OSM / geo-located courses). */
  geo?: GeoPoint;
}

export interface LayupZone {
  id: string;
  label: string;
  /** Yards from the tee to reach this layup. */
  yards: number;
  position: Point;
}

export interface Green {
  /** Yardage from the tee to the front / middle / back of the green. */
  frontYards: number;
  middleYards: number;
  backYards: number;
  center: Point;
  front: Point;
  back: Point;
  /** Real-world green positions (present for OSM / geo-located courses). */
  centerGeo?: GeoPoint;
  frontGeo?: GeoPoint;
  backGeo?: GeoPoint;
}

export interface Hole {
  number: number;
  par: 3 | 4 | 5;
  handicapIndex: number;
  /** Optional shape note shown to the player. */
  shape?: string;
  tees: TeeBox[];
  green: Green;
  hazards: Hazard[];
  layups: LayupZone[];
  /** Dogleg point if present (normalized canvas position). */
  dogleg?: Point;
}

export interface Course {
  id: string;
  name: string;
  city: string;
  state: string;
  par: number;
  /** Approximate distance from the user in miles (for the "nearby" list). */
  distanceMiles?: number;
  holes: Hole[];
  /** True for built-in mock courses; real API courses will set this false. */
  isMock: boolean;
  /** Course center (present for OSM / geo-located courses). */
  geo?: GeoPoint;
  /** Data source for UI labelling. */
  source?: "mock" | "osm";
}

export interface Weather {
  temperatureF: number;
  windSpeedMph: number;
  /** Direction the wind is blowing TOWARD, in degrees (0 = toward target/north). */
  windDirectionDeg: number;
  humidityPct: number;
  /** Human label e.g. "helping", "hurting", "left-to-right". */
  relativeToShot?: string;
  isMock: boolean;
}

/** A single tracked stroke within a round. */
export interface Shot {
  id: string;
  holeNumber: number;
  lie: LieType;
  club?: ClubId;
  distanceYards?: number;
  result?: "great" | "good" | "ok" | "poor" | "penalty";
}

export interface HoleScore {
  holeNumber: number;
  par: number;
  strokes: number;
  putts: number;
  chips: number;
  penalties: number;
  fairwayHit: boolean | null; // null for par 3s
  greenInRegulation: boolean;
  teeResult?: "fairway" | "rough" | "bunker" | "ob" | "recovery";
}

export interface Round {
  id: string;
  courseId: string;
  courseName: string;
  teeId: string;
  startedAt: string;
  finishedAt?: string;
  holeScores: HoleScore[];
}

/** Output of the caddie recommendation engine. */
export interface ShotOption {
  label: string;
  club: ClubId;
  clubLabel: string;
  carryYards: number;
  description: string;
}

export interface CaddieRecommendation {
  /** Primary recommended play. */
  primary: ShotOption;
  conservative: ShotOption;
  aggressive: ShotOption;
  targetLine: string;
  safeMiss: string;
  expectedResult: string;
  /** Plain-English explanation (rule-based or AI-enhanced). */
  explanation: string;
  /** Effective playing yardage after wind / elevation / temperature. */
  playsLikeYards: number;
  /** True when the explanation text came from the OpenAI layer. */
  aiEnhanced: boolean;
  notes: string[];
}

export interface RecommendationInput {
  targetYards: number;
  lie: LieType;
  skillLevel: SkillLevel;
  dominantHand: DominantHand;
  shotShape: ShotShape;
  riskTolerance: RiskTolerance;
  clubs: Club[];
  weather?: Weather;
  elevationChangeYards?: number; // + = uphill, - = downhill
  hazards?: Hazard[];
  /** Yards to clear the closest threatening carry hazard, if any. */
  forcedCarryYards?: number;
  pinNote?: "front" | "middle" | "back" | "left" | "right";
  scoreSituation?: string;
}
