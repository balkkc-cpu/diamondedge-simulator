/** Normalized live game state from MLB Stats API (linescore + live feed extras). */

export type LiveGamePayload = {
  gamePk: string;
  awayTeam: string;
  homeTeam: string;
  awayAbbr?: string;
  homeAbbr?: string;
  awayScore: number;
  homeScore: number;
  inning: number;
  inningState: string;
  inningHalf: "top" | "bottom" | "middle" | "end" | "unknown";
  outs: number;
  balls: number;
  strikes: number;
  firstOccupied: boolean;
  secondOccupied: boolean;
  thirdOccupied: boolean;
  status: string;
  detailedState: string;
  inningScoresAway: Array<{ inning: number; runs?: number }>;
  inningScoresHome: Array<{ inning: number; runs?: number }>;
  winProbAway: number;
  winProbHome: number;
  /** Current plate appearance — pitcher vs batter */
  atBatPitcher?: string;
  atBatBatter?: string;
  onDeck?: string;
  inHole?: string;
  /** Most recent completed or in-progress play description */
  lastPlayText?: string;
};

function simpleWinProb(away: number, home: number, inning: number, half: string, outs: number): { away: number; home: number } {
  const diff = away - home;
  const inningsLeft = Math.max(0, 9 - inning);
  let leverage = 0.5 + Math.min(0.35, Math.abs(diff) * 0.04);
  if (half === "top" && diff < 0) leverage -= 0.05 * (outs / 2);
  if (half === "bottom" && diff > 0) leverage -= 0.05 * (outs / 2);
  const awayAdj =
    diff > 0
      ? 0.5 + leverage * 0.2
      : diff < 0
        ? 0.5 - leverage * 0.2
        : 0.5 + (half === "top" ? -0.02 : 0.02);
  const clamped = Math.min(0.92, Math.max(0.08, awayAdj + diff * 0.03 + inningsLeft * 0.005));
  return { away: clamped, home: 1 - clamped };
}

function pickLastPlayDescription(feedJson: Record<string, unknown> | null, currentPlay: Record<string, unknown> | null): string | undefined {
  if (!feedJson) return undefined;
  const plays = feedJson.liveData as Record<string, unknown> | undefined;
  const all = (plays?.plays as Record<string, unknown> | undefined)?.all as unknown[] | undefined;
  if (Array.isArray(all) && all.length) {
    for (let i = all.length - 1; i >= 0; i--) {
      const p = all[i] as Record<string, unknown>;
      const res = p?.result as Record<string, unknown> | undefined;
      const desc = res?.description as string | undefined;
      if (desc && desc.trim()) return desc.trim();
      const ev = res?.event as string | undefined;
      if (ev && ev.trim()) return ev.trim();
    }
  }
  if (currentPlay) {
    const res = currentPlay.result as Record<string, unknown> | undefined;
    const d = res?.description as string | undefined;
    if (d?.trim()) return d.trim();
    const events = currentPlay.playEvents as unknown[] | undefined;
    if (Array.isArray(events) && events.length) {
      const last = events[events.length - 1] as Record<string, unknown>;
      const det = last?.details as Record<string, unknown> | undefined;
      const desc2 = det?.description as string | undefined;
      if (desc2?.trim()) return desc2.trim();
    }
  }
  return undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  if (v !== null && typeof v === "object") return v as Record<string, unknown>;
  return undefined;
}

function parseHalf(raw: string): LiveGamePayload["inningHalf"] {
  const s = raw.toLowerCase();
  if (s.includes("top")) return "top";
  if (s.includes("bottom") || s.includes("bot")) return "bottom";
  if (s.includes("middle")) return "middle";
  if (s.includes("end")) return "end";
  return "unknown";
}

export async function fetchLiveGameState(gamePk: string): Promise<LiveGamePayload | null> {
  try {
    const [lsRes, feedRes] = await Promise.all([
      fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/linescore`, { next: { revalidate: 10 } }),
      fetch(`https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live`, { next: { revalidate: 10 } })
    ]);

    if (!lsRes.ok) return null;
    const ls = await lsRes.json();
    const feedJson = feedRes.ok ? ((await feedRes.json()) as Record<string, unknown>) : null;
    const liveData = asRecord(feedJson?.liveData);
    const playsBlock = asRecord(liveData?.plays);
    const allPlays = Array.isArray(playsBlock?.all) ? (playsBlock.all as unknown[]) : [];
    const lastFromAll = allPlays.length ? (allPlays[allPlays.length - 1] as Record<string, unknown>) : null;
    const play = (playsBlock?.currentPlay ?? lastFromAll) as Record<string, unknown> | null;
    const count = (play?.count ?? {}) as Record<string, unknown>;

    const gameData = asRecord(feedJson?.gameData);
    const feedTeams = asRecord(gameData?.teams);
    const feedAwayTeam = asRecord(feedTeams?.away);
    const feedHomeTeam = asRecord(feedTeams?.home);

    const awayTeam = ls.teams?.away?.team?.name ?? (feedAwayTeam?.name as string | undefined) ?? "Away";
    const homeTeam = ls.teams?.home?.team?.name ?? (feedHomeTeam?.name as string | undefined) ?? "Home";
    const awayAbbr = ls.teams?.away?.team?.abbreviation ?? (feedAwayTeam?.abbreviation as string | undefined);
    const homeAbbr = ls.teams?.home?.team?.abbreviation ?? (feedHomeTeam?.abbreviation as string | undefined);

    const awayScore = Number(ls.teams?.away?.runs ?? 0);
    const homeScore = Number(ls.teams?.home?.runs ?? 0);
    const inning = Number(ls.currentInning ?? 1);
    const inningState = String(ls.inningState ?? ls.inningHalf ?? "");
    const halfStr = String(ls.inningHalf ?? ls.inningState ?? "");
    const half = parseHalf(halfStr || inningState);

    let outs = Number(ls.outs ?? ls.defense?.outs ?? 0);
    if (Number.isNaN(outs)) outs = 0;
    outs = Math.min(2, Math.max(0, outs));

    let balls = Number(count.balls ?? ls.defense?.balls ?? 0);
    let strikes = Number(count.strikes ?? ls.defense?.strikes ?? 0);
    if (Number.isNaN(balls)) balls = 0;
    if (Number.isNaN(strikes)) strikes = 0;
    balls = Math.min(3, Math.max(0, balls));
    strikes = Math.min(2, Math.max(0, strikes));

    const liveRunners = liveData?.runners;
    const runnerListRaw = play?.runners ?? liveRunners;
    const runnerList = Array.isArray(runnerListRaw) ? runnerListRaw : [];
    const basesFromRunners = { first: false, second: false, third: false };
    for (const r of runnerList) {
      const row = asRecord(r);
      const mov = asRecord(row?.movement);
      const det = asRecord(row?.details);
      const end = String(mov?.end ?? det?.eventType ?? "").toLowerCase();
      if (end.includes("4b") || mov?.end === "score") continue;
      const base = mov?.end;
      if (base === "1B" || base === 1) basesFromRunners.first = true;
      if (base === "2B" || base === 2) basesFromRunners.second = true;
      if (base === "3B" || base === 3) basesFromRunners.third = true;
    }

    const def = ls.defense ?? {};
    const off = ls.offense ?? {};
    const firstOccupied = basesFromRunners.first || Boolean(off.first || def.first?.id);
    const secondOccupied = basesFromRunners.second || Boolean(off.second || def.second?.id);
    const thirdOccupied = basesFromRunners.third || Boolean(off.third || def.third?.id);

    const innings = ls.innings ?? [];
    const inningScoresAway = innings.map((inn: { num: number; away?: { runs: number } }) => ({
      inning: inn.num,
      runs: inn.away?.runs
    }));
    const inningScoresHome = innings.map((inn: { num: number; home?: { runs: number } }) => ({
      inning: inn.num,
      runs: inn.home?.runs
    }));

    const feedStatus = asRecord(gameData?.status);
    const status =
      ls.status?.abstractGameState ?? (feedStatus?.abstractGameState as string | undefined) ?? "Preview";
    const detailedState = ls.status?.detailedState ?? (feedStatus?.detailedState as string | undefined) ?? "";

    const wp = simpleWinProb(awayScore, homeScore, inning, halfStr || inningState, outs);

    const matchup = play?.matchup as Record<string, unknown> | undefined;
    const pit = matchup?.pitcher as Record<string, unknown> | undefined;
    const bat = matchup?.batter as Record<string, unknown> | undefined;
    const deck = matchup?.onDeck as Record<string, unknown> | undefined;
    const hole = matchup?.inHole as Record<string, unknown> | undefined;

    const lsDef = ls.defense as Record<string, unknown> | undefined;
    const lsOff = ls.offense as Record<string, unknown> | undefined;
    const lsPit = lsDef?.pitcher as Record<string, unknown> | undefined;
    const lsBat = lsOff?.batter as Record<string, unknown> | undefined;

    const atBatPitcher =
      (pit?.fullName as string) ||
      (lsPit?.fullName as string) ||
      (typeof lsPit?.summary === "string" ? (lsPit.summary as string) : undefined);
    const atBatBatter =
      (bat?.fullName as string) ||
      (lsBat?.fullName as string) ||
      (typeof lsBat?.summary === "string" ? (lsBat.summary as string) : undefined);
    const onDeck = deck?.fullName as string | undefined;
    const inHole = hole?.fullName as string | undefined;
    const lastPlayText = pickLastPlayDescription(feedJson, play);

    return {
      gamePk,
      awayTeam,
      homeTeam,
      awayAbbr,
      homeAbbr,
      awayScore,
      homeScore,
      inning: Math.max(1, inning),
      inningState,
      inningHalf: half,
      outs,
      balls,
      strikes,
      firstOccupied,
      secondOccupied,
      thirdOccupied,
      status,
      detailedState,
      inningScoresAway,
      inningScoresHome,
      winProbAway: wp.away,
      winProbHome: wp.home,
      atBatPitcher,
      atBatBatter,
      onDeck,
      inHole,
      lastPlayText
    };
  } catch {
    return null;
  }
}
