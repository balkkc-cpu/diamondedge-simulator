import { GameCard, Market } from "./types";
import { HITTER_MATRIX, PITCHER_MATRIX, PickKind, StatKey } from "./playerPropCatalog";

const MLB = "https://statsapi.mlb.com/api/v1";

/** Full active roster per team (all position players / all pitchers). */
const ROSTER_CACHE_TTL_MS = 1000 * 60 * 60 * 3; // 3 hours
type CachedNames = { names: string[]; expiresAt: number };
const rosterHittersCache = new Map<number, CachedNames>();
const rosterPitchersCache = new Map<number, CachedNames>();

async function fetchJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) throw new Error(url);
  return res.json();
}

/** Every active position player (non-P) on the 26-man / active roster. */
export async function getHitterNamesForTeam(teamId: number): Promise<string[]> {
  const cached = rosterHittersCache.get(teamId);
  if (cached && Date.now() < cached.expiresAt) return cached.names;
  try {
    const data = await fetchJson(`${MLB}/teams/${teamId}/roster?rosterType=active`);
    const roster = (data.roster ?? []) as Array<{ position?: { abbreviation?: string }; person?: { fullName?: string } }>;
    const names = roster
      .filter((r) => r.position?.abbreviation && r.position.abbreviation !== "P")
      .map((r) => r.person?.fullName)
      .filter(Boolean) as string[];
    const unique = [...new Set(names)];
    rosterHittersCache.set(teamId, { names: unique, expiresAt: Date.now() + ROSTER_CACHE_TTL_MS });
    return unique;
  } catch {
    return [];
  }
}

/** Every active pitcher on the roster. */
async function getPitcherNamesForTeam(teamId: number): Promise<string[]> {
  const cached = rosterPitchersCache.get(teamId);
  if (cached && Date.now() < cached.expiresAt) return cached.names;
  try {
    const data = await fetchJson(`${MLB}/teams/${teamId}/roster?rosterType=active`);
    const roster = (data.roster ?? []) as Array<{ position?: { abbreviation?: string }; person?: { fullName?: string } }>;
    const names = roster
      .filter((r) => r.position?.abbreviation === "P")
      .map((r) => r.person?.fullName)
      .filter(Boolean) as string[];
    const unique = [...new Set(names)];
    rosterPitchersCache.set(teamId, { names: unique, expiresAt: Date.now() + ROSTER_CACHE_TTL_MS });
    return unique;
  } catch {
    return [];
  }
}

function propOdds(seed: number, salt: number): number {
  const base = -118 + ((seed * 19 + salt * 37) % 47);
  return Math.min(220, Math.max(-240, base));
}

function slug(s: string) {
  return s.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 48);
}

function pushOu(
  markets: Market[],
  gameId: string,
  playerName: string,
  stat: Exclude<StatKey, "k">,
  line: number,
  salt: number
) {
  const cfg = HITTER_MATRIX[stat];
  const overId = `${gameId}-${stat}-ouo-${line}-${slug(playerName)}`;
  const underId = `${gameId}-${stat}-ouu-${line}-${slug(playerName)}`;
  markets.push(
    {
      id: overId,
      gameId,
      marketType: `player_${stat}`,
      selection: `${playerName} · Over ${line} ${cfg.label}`,
      line,
      american: propOdds(salt, 1),
      source: "model",
      playerName,
      statKey: stat,
      pickKind: "over_under" as PickKind,
      tierMin: null
    },
    {
      id: underId,
      gameId,
      marketType: `player_${stat}`,
      selection: `${playerName} · Under ${line} ${cfg.label}`,
      line,
      american: propOdds(salt + 3, 2),
      source: "model",
      playerName,
      statKey: stat,
      pickKind: "over_under" as PickKind,
      tierMin: null
    }
  );
}

function pushTier(
  markets: Market[],
  gameId: string,
  playerName: string,
  stat: Exclude<StatKey, "k">,
  tier: number,
  salt: number
) {
  const cfg = HITTER_MATRIX[stat];
  const id = `${gameId}-${stat}-t${tier}-${slug(playerName)}`;
  markets.push({
    id,
    gameId,
    marketType: `player_${stat}`,
    selection: `${playerName} · ${tier}+ ${cfg.label}`,
    line: tier,
    american: propOdds(salt + tier * 11, 50 + tier),
    source: "model",
    playerName,
    statKey: stat,
    pickKind: "tier_plus" as PickKind,
    tierMin: tier
  });
}

function pushHrYes(markets: Market[], gameId: string, playerName: string, salt: number) {
  markets.push({
    id: `${gameId}-hr-yes-${slug(playerName)}`,
    gameId,
    marketType: "player_hr",
    selection: `${playerName} · To hit a home run (Yes)`,
    line: null,
    american: propOdds(salt, 99),
    source: "model",
    playerName,
    statKey: "hr" as StatKey,
    pickKind: "yes_no" as PickKind,
    tierMin: 1
  });
}

function pushPitcherK(markets: Market[], gameId: string, pitcherName: string, salt: number) {
  const cfg = PITCHER_MATRIX.k;
  for (const line of cfg.ou) {
    const overId = `${gameId}-k-ouo-${line}-${slug(pitcherName)}`;
    const underId = `${gameId}-k-ouu-${line}-${slug(pitcherName)}`;
    markets.push(
      {
        id: overId,
        gameId,
        marketType: "player_k",
        selection: `${pitcherName} · Over ${line} ${cfg.label}`,
        line,
        american: propOdds(salt + Math.round(line * 10), 200),
        source: "model",
        playerName: pitcherName,
        statKey: "k" as StatKey,
        pickKind: "over_under" as PickKind,
        tierMin: null
      },
      {
        id: underId,
        gameId,
        marketType: "player_k",
        selection: `${pitcherName} · Under ${line} ${cfg.label}`,
        line,
        american: propOdds(salt + Math.round(line * 10) + 1, 201),
        source: "model",
        playerName: pitcherName,
        statKey: "k" as StatKey,
        pickKind: "over_under" as PickKind,
        tierMin: null
      }
    );
  }
  for (const tier of cfg.tiers) {
    markets.push({
      id: `${gameId}-k-t${tier}-${slug(pitcherName)}`,
      gameId,
      marketType: "player_k",
      selection: `${pitcherName} · ${tier}+ ${cfg.label}`,
      line: tier,
      american: propOdds(salt + tier * 7, 300 + tier),
      source: "model",
      playerName: pitcherName,
      statKey: "k" as StatKey,
      pickKind: "tier_plus" as PickKind,
      tierMin: tier
    });
  }
}

const HITTER_STAT_ORDER: Exclude<StatKey, "k">[] = ["hits", "runs", "rbi", "tb", "hrr", "hr", "walks"];

function buildHitterBoard(gameId: string, name: string, saltBase: number) {
  const markets: Market[] = [];
  for (let idx = 0; idx < HITTER_STAT_ORDER.length; idx++) {
    const stat = HITTER_STAT_ORDER[idx];
    const cfg = HITTER_MATRIX[stat];
    const salt = saltBase + idx * 17 + name.length;
    if (stat === "hr") pushHrYes(markets, gameId, name, salt);
    for (const line of cfg.ou) pushOu(markets, gameId, name, stat, line, salt + Math.round(line * 5));
    for (const tier of cfg.tiers) pushTier(markets, gameId, name, stat, tier, salt + tier * 3);
  }
  return markets;
}

/**
 * Every eligible hitter gets the same full prop menu; every pitcher gets the same K menu.
 */
export async function buildPlayerPropMarkets(game: GameCard & { homeTeamId?: number; awayTeamId?: number }): Promise<Market[]> {
  const hid = game.homeTeamId;
  const aid = game.awayTeamId;
  if (!hid || !aid) return [];

  const [homeHitters, awayHitters, homePitchers, awayPitchers] = await Promise.all([
    getHitterNamesForTeam(hid),
    getHitterNamesForTeam(aid),
    getPitcherNamesForTeam(hid),
    getPitcherNamesForTeam(aid)
  ]);

  const markets: Market[] = [];

  homeHitters.forEach((name, i) => {
    markets.push(...buildHitterBoard(game.id, name, game.id.charCodeAt(i % game.id.length) + i * 31));
  });
  awayHitters.forEach((name, i) => {
    markets.push(...buildHitterBoard(game.id, name, game.id.charCodeAt((i + 3) % game.id.length) + i * 29));
  });

  const pp = game.probablePitchers?.split(" vs ") ?? [];
  const starterNames = new Set<string>();
  const h = pp[0]?.trim();
  const a = pp[1]?.trim();
  if (h && h !== "TBD") starterNames.add(h);
  if (a && a !== "TBD") starterNames.add(a);

  const pitcherUnion = [...new Set([...starterNames, ...homePitchers, ...awayPitchers])];
  pitcherUnion.forEach((name, i) => {
    pushPitcherK(markets, game.id, name, game.id.length + i * 41 + name.length);
  });

  return markets;
}
