/**
 * Caddie personalities. Each user is assigned a consistent caddie (by a hash of
 * their account email), so the voice/tone of the advice feels personal and is
 * different from one player to the next. The persona also seeds the phrasing
 * variety in `explain.ts`.
 */

export interface CaddiePersona {
  id: string;
  name: string;
  tagline: string;
  /** Opening lines (situation intros). */
  openers: string[];
  /** Mid-shot confidence/strategy connectors. */
  connectors: string[];
  /** Closing encouragements. */
  signoffs: string[];
}

export const PERSONAS: CaddiePersona[] = [
  {
    id: "mac",
    name: "Mac",
    tagline: "Calm veteran looper",
    openers: ["Alright, let's read this one.", "Okay, here's the picture.", "Take a breath — easy shot."],
    connectors: ["No need to force it.", "Smooth and committed.", "Trust the number."],
    signoffs: ["Boring golf wins.", "Two-putt and walk on.", "Stay patient, you're playing well."],
  },
  {
    id: "sully",
    name: "Sully",
    tagline: "Fiery motivator",
    openers: ["Let's go — this is a chance.", "Step in, we want this one.", "Eyes up, here's the play."],
    connectors: ["Commit and rip it.", "Be decisive.", "Pick your spot and trust it."],
    signoffs: ["Now go make a birdie look.", "Be aggressive on the right shot.", "Believe in the swing."],
  },
  {
    id: "iris",
    name: "Iris",
    tagline: "Analytical strategist",
    openers: ["Let's run the numbers.", "Here's the percentages.", "By the data, here's the smart line."],
    connectors: ["The math likes the center.", "Dispersion favors this.", "Play the high-percentage shot."],
    signoffs: ["Lowest expected score wins.", "Manage the misses.", "Course management over heroics."],
  },
  {
    id: "duke",
    name: "Duke",
    tagline: "Old-school grinder",
    openers: ["Keep it simple here.", "Plain and steady.", "Nothing fancy on this one."],
    connectors: ["Put a good swing on it.", "Middle of the face.", "Stay within yourself."],
    signoffs: ["Grind out a good number.", "Take your par and move.", "Fairways and greens."],
  },
  {
    id: "nova",
    name: "Nova",
    tagline: "Tour-style closer",
    openers: ["Tournament shot — let's execute.", "Here's the tour play.", "Lock in on this one."],
    connectors: ["Quality strike, controlled flight.", "Start it on line and hold it.", "Trust your stock shot."],
    signoffs: ["Hit it close and convert.", "This is how you separate.", "Execute and breathe."],
  },
];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic caddie for a given user seed (e.g. their email). */
export function personaForUser(seed: string | undefined): CaddiePersona {
  const h = hashString(seed && seed.length ? seed : "guest");
  return PERSONAS[h % PERSONAS.length];
}

/** Seeded pick from an array (stable for the same seed). */
export function seededPick<T>(arr: T[], seed: string): T {
  if (arr.length === 0) throw new Error("seededPick: empty array");
  return arr[hashString(seed) % arr.length];
}
