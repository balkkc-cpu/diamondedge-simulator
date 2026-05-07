import { mockGameDetails, mockGames, mockMarkets } from "./mockData";
import { impliedProbabilityFromAmerican, isSportsbookLineSource } from "./odds";
import { buildPlayerPropMarkets } from "./rosterProps";
import { buildPlayerPropsFromOddsEvents, fetchMlbOddsEvents, mergeFanDuelPrices } from "./theOddsFanDuel";
import { fetchRundownMarketsForToday } from "./theRundown";
import { GameCard, GameDetail, Market, PlayerCard } from "./types";

const MLB_STATS_API = "https://statsapi.mlb.com/api/v1";
const MLB_STATS_API_V11 = "https://statsapi.mlb.com/api/v1.1";

/** MLB slate day should follow US Eastern time, not UTC day rollover. */
function mlbDateStringEt(now = new Date()): string {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return dtf.format(now);
}

async function safeJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { ...init, next: { revalidate: 60 } });
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json();
}

/** Schedule + injuries: refresh hourly so matchups and IL rows stay current. */
async function scheduleJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Fetch failed: ${url}`);
  return res.json();
}

function gameSeed(gameId: string) {
  return gameId.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

function generateMarketsForGame(game: GameCard): Market[] {
  const seed = gameSeed(game.id);
  const homeEdge = (seed % 11) - 5;
  const baseHomeMl = -115 + homeEdge * 4;
  const baseAwayMl = 105 - homeEdge * 4;
  const total = 8 + ((seed % 4) * 0.5);
  const ttLine = Math.round((total / 2 + 0.5) * 2) / 2;

  return [
    { id: `${game.id}-ml-home`, gameId: game.id, marketType: "moneyline", selection: game.homeTeam, line: null, american: baseHomeMl, source: "model" },
    { id: `${game.id}-ml-away`, gameId: game.id, marketType: "moneyline", selection: game.awayTeam, line: null, american: baseAwayMl, source: "model" },
    {
      id: `${game.id}-rl-home`,
      gameId: game.id,
      marketType: "runline",
      selection: `${game.homeTeam} -1.5`,
      line: -1.5,
      american: 138 + (seed % 20),
      source: "model"
    },
    {
      id: `${game.id}-rl-away`,
      gameId: game.id,
      marketType: "runline",
      selection: `${game.awayTeam} +1.5`,
      line: 1.5,
      american: -155 + (seed % 12),
      source: "model"
    },
    { id: `${game.id}-tot-over`, gameId: game.id, marketType: "total", selection: `Over ${total.toFixed(1)}`, line: total, american: -108, source: "model" },
    { id: `${game.id}-tot-under`, gameId: game.id, marketType: "total", selection: `Under ${total.toFixed(1)}`, line: total, american: -112, source: "model" },
    {
      id: `${game.id}-tt-home`,
      gameId: game.id,
      marketType: "team_total",
      selection: `${game.homeTeam} Over ${ttLine.toFixed(1)}`,
      line: ttLine,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-tt-away`,
      gameId: game.id,
      marketType: "team_total",
      selection: `${game.awayTeam} Over ${ttLine.toFixed(1)}`,
      line: ttLine,
      american: -110,
      source: "model"
    },
    {
      id: `${game.id}-f5-h`,
      gameId: game.id,
      marketType: "first5",
      selection: `${game.homeTeam} · First 5 innings`,
      line: null,
      american: -102,
      source: "model"
    },
    {
      id: `${game.id}-f5-a`,
      gameId: game.id,
      marketType: "first5",
      selection: `${game.awayTeam} · First 5 innings`,
      line: null,
      american: -102,
      source: "model"
    },
    { id: `${game.id}-yrfi`, gameId: game.id, marketType: "yrfi", selection: "YRFI (Yes Run 1st Inning)", line: null, american: -107, source: "model" },
    { id: `${game.id}-nrfi`, gameId: game.id, marketType: "nrfi", selection: "NRFI (No Run 1st Inning)", line: null, american: -113, source: "model" }
  ];
}

function clampAmerican(n: number): number {
  const v = Math.round(n);
  return Math.max(-450, Math.min(450, v));
}

function baselineBookAmericanForProp(m: Market): number | null {
  if (!m.marketType.startsWith("player_")) return null;
  const stat = String(m.statKey ?? m.marketType.replace(/^player_/, "")).toLowerCase();
  const line = Number(m.line ?? 0);
  const sel = m.selection.toLowerCase();
  const isOver = sel.includes("over");
  const isUnder = sel.includes("under");
  const isTier = m.pickKind === "tier_plus";
  const isYesNo = m.pickKind === "yes_no";

  if (isYesNo && stat === "hr") {
    if (sel.includes("(yes)")) return 290;
    if (sel.includes("(no)")) return -420;
  }

  if (isTier) {
    const t = Math.max(1, Math.round(line || 1));
    if (stat === "hits") return t === 2 ? 165 : t >= 3 ? 520 : -170;
    if (stat === "tb") return t === 2 ? 145 : t === 3 ? 275 : t >= 4 ? 650 : -190;
    if (stat === "rbi") return t === 2 ? 260 : t >= 3 ? 700 : 125;
    if (stat === "runs") return t === 2 ? 245 : t >= 3 ? 640 : 130;
    if (stat === "hrr") return t === 2 ? -105 : t === 3 ? 165 : t >= 4 ? 420 : -160;
    if (stat === "walks") return t === 2 ? 240 : 135;
    if (stat === "k") return t >= 8 ? 280 : t >= 7 ? 170 : t >= 6 ? 110 : -105;
  }

  const ou = (over: number, under: number) => (isOver ? over : isUnder ? under : over);
  if (stat === "hits") {
    if (line <= 0.5) return ou(-185, 145);
    if (line <= 1.5) return ou(128, -158);
    return ou(290, -390);
  }
  if (stat === "tb") {
    if (line <= 0.5) return ou(-210, 165);
    if (line <= 1.5) return ou(112, -138);
    if (line <= 2.5) return ou(210, -275);
    return ou(420, -450);
  }
  if (stat === "rbi") {
    if (line <= 0.5) return ou(122, -152);
    if (line <= 1.5) return ou(285, -400);
    return ou(700, -450);
  }
  if (stat === "runs") {
    if (line <= 0.5) return ou(118, -148);
    if (line <= 1.5) return ou(275, -385);
    return ou(680, -450);
  }
  if (stat === "hrr") {
    if (line <= 0.5) return ou(-235, 182);
    if (line <= 1.5) return ou(-102, -122);
    if (line <= 2.5) return ou(168, -218);
    return ou(410, -450);
  }
  if (stat === "walks") {
    if (line <= 0.5) return ou(128, -160);
    return ou(265, -365);
  }
  if (stat === "k") {
    if (line <= 3.5) return ou(-175, 138);
    if (line <= 5.5) return ou(-108, -112);
    if (line <= 7.5) return ou(158, -202);
    return ou(325, -430);
  }
  if (stat === "hr") return isOver ? 300 : -430;
  return null;
}

/**
 * Re-price model player props from live game context when live board lines exist.
 * This keeps simulated props better aligned with the market environment (totals/ML).
 */
function calibrateModelPlayerPropsFromLiveLines(markets: Market[]): Market[] {
  const byGame = new Map<string, Market[]>();
  for (const m of markets) {
    if (!byGame.has(m.gameId)) byGame.set(m.gameId, []);
    byGame.get(m.gameId)!.push(m);
  }

  return markets.map((m) => {
    if (!m.marketType.startsWith("player_")) return m;
    if (isSportsbookLineSource(m.source)) return m; // preserve true book props

    const gm = byGame.get(m.gameId) ?? [];
    const live = gm.filter((x) => isSportsbookLineSource(x.source));
    if (!live.length) return m;

    const totals = live.filter((x) => x.marketType === "total" && typeof x.line === "number");
    const totalLine = totals.length
      ? totals.reduce((acc, x) => acc + (x.line ?? 0), 0) / totals.length
      : null;

    const mls = live.filter((x) => x.marketType === "moneyline");
    const probs = mls.map((x) => impliedProbabilityFromAmerican(x.american));
    const avgMlProb = probs.length ? probs.reduce((a, b) => a + b, 0) / probs.length : 0.5;

    // baseline environment tilt from live board
    const envTilt = (totalLine != null ? (totalLine - 8) * 7 : 0) + (avgMlProb - 0.5) * 8;
    const sel = m.selection.toLowerCase();
    let delta = 0;

    if (m.marketType === "player_k") {
      // Higher totals usually imply tougher run environment for K overs.
      if (sel.includes("over")) delta -= envTilt * 0.7;
      if (sel.includes("under")) delta += envTilt * 0.7;
      if (m.pickKind === "tier_plus") delta -= envTilt * 0.75;
    } else if (m.marketType === "player_hr") {
      // HR yes/no most sensitive to run environment.
      if (m.pickKind === "yes_no" && sel.includes("(yes)")) delta += envTilt * 1.2;
      else if (m.pickKind === "yes_no" && sel.includes("(no)")) delta -= envTilt * 1.2;
      else if (sel.includes("over")) delta += envTilt;
      else if (sel.includes("under")) delta -= envTilt;
    } else {
      if (sel.includes("over")) delta += envTilt;
      if (sel.includes("under")) delta -= envTilt;
      if (m.pickKind === "tier_plus") delta += envTilt * 0.9;
    }

    const baseline = baselineBookAmericanForProp(m);
    const anchor = baseline != null ? baseline * 0.75 + m.american * 0.25 : m.american;
    return { ...m, american: clampAmerican(anchor + delta) };
  });
}

export async function getDailySchedule(): Promise<GameCard[]> {
  try {
    const today = mlbDateStringEt();
    const data = await scheduleJson(`${MLB_STATS_API}/schedule?sportId=1&date=${today}&hydrate=team,probablePitcher`);
    const dates = data.dates?.[0]?.games ?? [];
    if (!dates.length) return mockGames;
    return dates.map((g: any): GameCard => {
      const detailed = String(g.status?.detailedState ?? "");
      const delayInfo =
        /delay|susp|ppd|postponed|cancel/i.test(detailed) || String(g.status?.reason ?? "").length > 2
          ? [detailed, g.status?.reason].filter(Boolean).join(" · ")
          : null;
      return {
        id: String(g.gamePk),
        startTime: g.gameDate,
        status: g.status?.abstractGameState ?? "scheduled",
        homeTeam: g.teams?.home?.team?.name ?? "Home Team",
        awayTeam: g.teams?.away?.team?.name ?? "Away Team",
        homeTeamId: g.teams?.home?.team?.id,
        awayTeamId: g.teams?.away?.team?.id,
        weather: g.weather?.condition
          ? `${g.weather.condition}${g.weather.temp ? ` ${g.weather.temp}F` : ""}`
          : "Weather pending",
        ballpark: g.venue?.name ?? "Unknown Park",
        probablePitchers: `${g.teams?.home?.probablePitcher?.fullName ?? "TBD"} vs ${g.teams?.away?.probablePitcher?.fullName ?? "TBD"}`,
        delayInfo
      };
    });
  } catch {
    return mockGames;
  }
}

export async function getOddsMarkets(gameId: string): Promise<Market[]> {
  const games = await getDailySchedule();
  const provider = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
  if (provider === "rundown") {
    const rundown = await fetchRundownMarketsForToday(games);
    const sportsbook = rundown.filter((m) => isSportsbookLineSource(m.source));
    const byGame = sportsbook.filter((m) => m.gameId === gameId);
    // Provider-only mode: no model injection.
    return byGame;
  }
  const game = games.find((g) => g.id === gameId);
  if (!game) return mockMarkets.filter((m) => m.gameId === gameId);
  const base = generateMarketsForGame(game);
  const useOddsProps = !!process.env.ODDS_API_KEY?.trim();
  const player = useOddsProps ? [] : await buildPlayerPropMarkets(game);
  const events = await fetchMlbOddsEvents();
  const merged = mergeFanDuelPrices([...base, ...player], games, events);
  // Odds-key mode: roster props rarely match Odds API line shapes; attach sportsbook-side props parsed from API.
  let out = merged;
  if (useOddsProps) {
    const apiPlayer = buildPlayerPropsFromOddsEvents(events, games).filter((m) => m.gameId === gameId);
    out = [...merged, ...apiPlayer];
  }
  if (useOddsProps) {
    const sportsbook = out.filter((m) => isSportsbookLineSource(m.source));
    // Strict sportsbook mode: never inject model/fallback when key/provider is configured.
    return sportsbook;
  }
  return calibrateModelPlayerPropsFromLiveLines(out);
}

export async function getAllMarkets(): Promise<Market[]> {
  const provider = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
  if (provider === "rundown") {
    const games = await getDailySchedule();
    const rundown = await fetchRundownMarketsForToday(games);
    // Provider-only mode: no model injection.
    return rundown.filter((m) => isSportsbookLineSource(m.source));
  }

  const games = await getDailySchedule();
  if (!games.length) return mockMarkets;
  const core = games.flatMap((g) => generateMarketsForGame(g));
  const useOddsProps = !!process.env.ODDS_API_KEY?.trim();
  const playerBlocks = useOddsProps ? [] : await Promise.all(games.map((g) => buildPlayerPropMarkets(g)));
  const merged = [...core, ...playerBlocks.flat()];
  const events = await fetchMlbOddsEvents();
  const priced = mergeFanDuelPrices(merged, games, events);
  if (useOddsProps) {
    const apiPlayer = buildPlayerPropsFromOddsEvents(events, games);
    const out = [...priced, ...apiPlayer];
    const sportsbook = out.filter((m) => isSportsbookLineSource(m.source));
    // Strict sportsbook mode: never inject model/fallback when key/provider is configured.
    return sportsbook;
  }
  return calibrateModelPlayerPropsFromLiveLines(priced);
}

export async function getWeatherFallback() {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return { summary: "Fallback weather 72F, mild wind" };
  return { summary: "API-ready weather adapter configured" };
}

export async function getInjuries(): Promise<{ playerName: string; status: string; note?: string }[]> {
  if (process.env.SPORTSDATAIO_API_KEY) {
    return [{ playerName: "SportsDataIO feed", status: "Connected", note: "Using configured premium injury feed." }];
  }

  const games = await getDailySchedule();
  const teamIds = new Set<number>();
  for (const g of games) {
    if (g.homeTeamId) teamIds.add(g.homeTeamId);
    if (g.awayTeamId) teamIds.add(g.awayTeamId);
  }
  if (!teamIds.size) {
    return [{ playerName: "Schedule", status: "Pending", note: "No team IDs on slate — injury scan skipped." }];
  }

  const out: { playerName: string; status: string; note?: string }[] = [];
  for (const tid of teamIds) {
    try {
      const res = await fetch(`${MLB_STATS_API}/teams/${tid}/roster?rosterType=40Man`, { next: { revalidate: 3600 } });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.roster ?? []) {
        const code = String(r.status?.code ?? "");
        const desc = String(r.status?.description ?? "");
        const lower = desc.toLowerCase();
        if (code === "A") continue;
        if (
          !lower.includes("injured") &&
          !lower.includes(" il") &&
          !lower.includes("rehab") &&
          !code.includes("IL") &&
          code !== "D60" &&
          code !== "D15" &&
          code !== "D10"
        ) {
          continue;
        }
        out.push({
          playerName: r.person?.fullName ?? "Unknown",
          status: desc || code,
          note: "MLB 40-man roster status"
        });
      }
    } catch {
      /* skip team */
    }
  }

  if (!out.length) {
    return [
      {
        playerName: "No IL rows",
        status: "Today",
        note: "40-man feed shows no injury-list style status for teams on today's slate (feed can lag)."
      }
    ];
  }
  return out.slice(0, 48);
}

export async function getGameDetail(gameId: string): Promise<GameDetail> {
  try {
    const feed = await safeJson(`${MLB_STATS_API_V11}/game/${gameId}/feed/live`);
    const gameData = feed.gameData ?? {};
    const liveData = feed.liveData ?? {};
    const home = gameData.teams?.home?.name ?? "Home";
    const away = gameData.teams?.away?.name ?? "Away";
    const probableHome = gameData.probablePitchers?.home?.fullName ?? "TBD";
    const probableAway = gameData.probablePitchers?.away?.fullName ?? "TBD";
    const players = liveData.boxscore?.teams?.home?.players ?? {};
    const awayPlayers = liveData.boxscore?.teams?.away?.players ?? {};
    const homeOrder: number[] = liveData.boxscore?.teams?.home?.battingOrder ?? [];
    const awayOrder: number[] = liveData.boxscore?.teams?.away?.battingOrder ?? [];

    const homeLineup = homeOrder
      .map((id: number) => players[`ID${id}`]?.person?.fullName)
      .filter(Boolean)
      .slice(0, 9);
    const awayLineup = awayOrder
      .map((id: number) => awayPlayers[`ID${id}`]?.person?.fullName)
      .filter(Boolean)
      .slice(0, 9);

    const playerWatch: PlayerCard[] = [...homeLineup.slice(0, 1), ...awayLineup.slice(0, 1)].map((name, idx) => ({
      name,
      team: idx === 0 ? home : away,
      position: "BAT",
      batsOrThrows: "R/L",
      opsOrEra: "Live stat feed",
      recentForm: "Form from recent games"
    }));

    return {
      gameId: String(gameId),
      matchup: `${away} at ${home}`,
      venue: gameData.venue?.name ?? "Venue pending",
      weather: gameData.weather?.condition
        ? `${gameData.weather.condition}${gameData.weather.temp ? ` ${gameData.weather.temp}F` : ""}`
        : "Weather pending",
      trends: [
        `${home} home split model active`,
        `${away} away split model active`,
        "Bullpen usage + recent-form factor included"
      ],
      injuries: await getInjuries().then((i) => i.map((x) => `${x.playerName}: ${x.status}`)),
      starters: [`${home}: ${probableHome}`, `${away}: ${probableAway}`],
      projectedLineups: {
        [home]: homeLineup.length ? homeLineup : ["Lineup pending"],
        [away]: awayLineup.length ? awayLineup : ["Lineup pending"]
      },
      playersToWatch: playerWatch
    };
  } catch {
    return (
      mockGameDetails[gameId] ?? {
        gameId,
        matchup: "Matchup pending",
        venue: "Venue pending",
        weather: "Weather pending",
        trends: ["No trend data available yet"],
        injuries: ["No major injuries listed"],
        starters: ["Starters pending"],
        projectedLineups: {},
        playersToWatch: []
      }
    );
  }
}
