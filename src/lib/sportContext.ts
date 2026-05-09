/**
 * Multi-sport wiring: MLB (existing) + NBA on the same deployment.
 * Mirrors MLB envs with optional `NBA_*` overrides (same semantics as root vars).
 */

export type SportCode = "mlb" | "nba";

export function parseSportCode(raw: string | null | undefined): SportCode {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  return s === "nba" ? "nba" : "mlb";
}

/** Eastern calendar day for slate fetches (MLB + NBA US schedules). */
export function slateDateStringEt(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function oddsProviderForSport(sport: SportCode): string {
  if (sport === "nba") {
    return String(process.env.NBA_ODDS_PROVIDER ?? process.env.ODDS_PROVIDER ?? "").toLowerCase();
  }
  return String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
}

export function oddsApiKeyForSport(sport: SportCode): string {
  if (sport === "nba") {
    return (process.env.NBA_ODDS_API_KEY ?? process.env.ODDS_API_KEY ?? "").trim();
  }
  return (process.env.ODDS_API_KEY ?? "").trim();
}

export function rundownApiKeyForSport(sport: SportCode): string {
  if (sport === "nba") {
    return (process.env.NBA_RUNDOWN_API_KEY ?? process.env.RUNDOWN_API_KEY ?? process.env.THERUNDOWN_API_KEY ?? "").trim();
  }
  return (process.env.RUNDOWN_API_KEY ?? process.env.THERUNDOWN_API_KEY ?? "").trim();
}

/** The Rundown `sport` path segment (MLB default 3; set `NBA_RUNDOWN_SPORT_ID` for NBA). */
export function rundownSportIdForSport(sport: SportCode): string {
  if (sport === "nba") {
    return String(process.env.NBA_RUNDOWN_SPORT_ID ?? "4").trim();
  }
  return String(process.env.RUNDOWN_SPORT_ID ?? "3").trim();
}

export function displayNameForSport(sport: SportCode): string {
  return sport === "nba" ? "NBA" : "MLB";
}
