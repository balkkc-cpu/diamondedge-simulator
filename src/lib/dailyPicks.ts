import { getAllMarkets, getDailySchedule, mlbDateStringEt } from "./apiClients";
import { createSeededRng, hashSeed, shuffleInPlace } from "./parlaySampling";
import { isPlayerPropMarketType, isSportsbookLineSource } from "./odds";
import { mockMarkets } from "./mockData";
import { runSimulation1000 } from "./simEngine";
import type { Market, SlipBet } from "./types";

export function marketToSlipBet(m: Market): SlipBet {
  return {
    id: m.id,
    gameId: m.gameId,
    marketType: m.marketType,
    selection: m.selection,
    line: m.line,
    oddsAmerican: m.american,
    playerName: m.playerName,
    statKey: m.statKey,
    pickKind: m.pickKind,
    tierMin: m.tierMin ?? null
  };
}

/** Flatten a diverse set of straights across games for the daily board scan. */
function candidateStraightBets(markets: Market[], maxPerGame = 3): SlipBet[] {
  const byGame = new Map<string, Market[]>();
  for (const m of markets) {
    if (m.marketType === "yrfi" || m.marketType === "nrfi") continue;
    if (!byGame.has(m.gameId)) byGame.set(m.gameId, []);
    byGame.get(m.gameId)!.push(m);
  }

  const dayKey = mlbDateStringEt();
  const gameOrder = shuffleInPlace([...byGame.keys()], createSeededRng(hashSeed(["daily-game-order", dayKey])));

  const out: SlipBet[] = [];
  for (const gid of gameOrder) {
    const arr = byGame.get(gid) ?? [];
    const fdFirst = (a: Market[]) => {
      const fd = a.filter((x) => isSportsbookLineSource(x.source));
      return fd.length ? fd : a;
    };

    const lines = shuffleInPlace(
      fdFirst(arr.filter((m) => !isPlayerPropMarketType(m.marketType))),
      createSeededRng(hashSeed(["daily-lines", dayKey, gid]))
    );
    const props = shuffleInPlace(
      fdFirst(arr.filter((m) => isPlayerPropMarketType(m.marketType))),
      createSeededRng(hashSeed(["daily-props", dayKey, gid]))
    );

    const takeLines = lines.slice(0, maxPerGame);
    const takeProps = props.slice(0, maxPerGame);
    for (const m of [...takeLines, ...takeProps]) {
      if (out.length >= 24) break;
      out.push(marketToSlipBet(m));
    }
    if (out.length >= 24) break;
  }
  return shuffleInPlace(out, createSeededRng(hashSeed(["daily-cand-final", dayKey])));
}

export type DailyPickRow = {
  rank: number;
  betId: string;
  gameId: string;
  selection: string;
  marketType: string;
  oddsAmerican: number;
  hitProbability: number;
  edge: number;
  suggestedUnits: number;
  suggestedUnitsNote?: string;
  whySuggested: string;
  leg: {
    betId: string;
    selection: string;
    whyItCouldHit: string[];
    whyItCouldMiss: string[];
    summary: string;
    stakeGuidance: string;
  };
};

export async function getDailyPicksPayload(): Promise<{
  generatedAt: string;
  gamesCount: number;
  picks: DailyPickRow[];
}> {
  const games = await getDailySchedule();
  const markets = await getAllMarkets();

  const priced = markets.filter((m) => Number.isFinite(m.american) && m.american >= -150 && m.american <= 150);
  const sportsbookFirst = priced.filter((m) => isSportsbookLineSource(m.source));
  const baseBoard = sportsbookFirst.length ? sportsbookFirst : priced.length ? priced : markets;

  let candidates = candidateStraightBets(baseBoard, 3);

  // If the real board is empty (off-days / no odds), fall back to mock board
  // so the widget never shows up completely blank.
  if (!candidates.length) {
    const mockBoard = mockMarkets.filter((m) => m.marketType !== "yrfi" && m.marketType !== "nrfi");
    candidates = candidateStraightBets(mockBoard, 3);
  }
  if (!candidates.length) {
    return { generatedAt: new Date().toISOString(), gamesCount: games.length, picks: [] };
  }

  const sim = runSimulation1000(candidates, { iterations: 800 });
  const dayKey = mlbDateStringEt();
  const ranked = sim.results
    .map((r, i) => ({ slip: candidates[i], result: r, breakdown: sim.breakdowns[i] }))
    .sort((a, b) => {
      const d = b.result.edge - a.result.edge;
      if (Math.abs(d) > 1e-7) return d;
      return hashSeed([a.slip.id, dayKey]) - hashSeed([b.slip.id, dayKey]);
    })
    .slice(0, 6);

  const picks: DailyPickRow[] = ranked.map((row, idx) => {
    const edgePct = (row.result.edge * 100).toFixed(1);
    const whySuggested =
      row.result.edge > 0.01
        ? `Ranked by sim edge among ${candidates.length} auto-scanned straights — about +${edgePct} pts vs breakeven implied by the American price on this run.`
        : row.result.edge > 0
          ? `Slight positive edge (+${edgePct} pts) vs breakeven in this run; still high variance — see “may miss” bullets.`
          : `Shown for slate context — edge is ${edgePct} pts on this run (no +EV claim); use as a research bookmark only.`;

    return {
      rank: idx + 1,
      betId: row.slip.id,
      gameId: row.slip.gameId,
      selection: row.slip.selection,
      marketType: row.slip.marketType,
      oddsAmerican: row.slip.oddsAmerican,
      hitProbability: row.result.hitProbability,
      edge: row.result.edge,
      suggestedUnits: row.result.suggestedUnits,
      suggestedUnitsNote: row.result.suggestedUnitsNote,
      whySuggested,
      leg: {
        betId: row.breakdown.betId,
        selection: row.breakdown.selection,
        whyItCouldHit: row.breakdown.whyItCouldHit,
        whyItCouldMiss: row.breakdown.whyItCouldMiss,
        summary: row.breakdown.summary,
        stakeGuidance: row.breakdown.stakeGuidance
      }
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    gamesCount: games.length,
    picks
  };
}
