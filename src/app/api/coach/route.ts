import { NextRequest, NextResponse } from "next/server";
import { getDailySchedule } from "@/lib/apiClients";
import { rateLimit } from "@/lib/rateLimit";
import { americanToDecimal, decimalToAmerican, isSportsbookLineSource } from "@/lib/odds";
import { runSimulation1000 } from "@/lib/simEngine";
import { buildPlayerPropsFromOddsEvents, fetchMlbOddsEvents, getOddsDebugState } from "@/lib/theOddsFanDuel";
import { fetchRundownMarketsForToday, getRundownDebugState } from "@/lib/theRundown";
import type { Market, SlipBet } from "@/lib/types";

type CoachReq = {
  question?: string;
  payload?: {
    bets?: SlipBet[];
    results?: Array<{
      betId: string;
      hitProbability: number;
      impliedProbability: number;
      edge: number;
      expectedValue: number;
      risk: string;
      suggestedUnits: number;
    }>;
    parlayHitProbability?: number;
  };
};

type ParlayReport = {
  parlayHitProbability: number;
  combinedAmerican: number;
  legs: Array<{
    selection: string;
    oddsAmerican: number;
    hitProbability: number;
    impliedProbability: number;
    edge: number;
    expectedValue: number;
    suggestedUnits: number;
  }>;
};

let lastGoodSportsbookProps: { at: number; markets: Market[] } | null = null;
const LAST_GOOD_PROPS_TTL_MS = 1000 * 60 * 60 * 6;

function toWords(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function inferStatHints(q: string): string[] {
  const out: string[] = [];
  if (/\bhr|home run/.test(q)) out.push("player_hr");
  if (/\bhit|hits\b/.test(q)) out.push("player_hits");
  if (/\brbi|rbis\b/.test(q)) out.push("player_rbi");
  if (/\bbase|bases|tb|total bases\b/.test(q)) out.push("player_tb");
  if (/\bstrikeout|strikeouts|k\b/.test(q)) out.push("player_k");
  if (/\bwalk|walks\b/.test(q)) out.push("player_walks");
  return out;
}

function marketMatchScore(m: Market, qWords: string[], statHints: string[]): number {
  let score = 0;
  const hay = `${m.selection} ${m.playerName ?? ""} ${m.marketType}`.toLowerCase();
  for (const w of qWords) {
    if (w.length < 3) continue;
    if (hay.includes(w)) score += 1.5;
  }
  if (m.playerName && qWords.some((w) => m.playerName!.toLowerCase().includes(w))) score += 2.5;
  if (statHints.includes(m.marketType)) score += 2;
  if (m.marketType.startsWith("player_")) score += 1;
  return score;
}

function fmtLine(m: Market): string {
  const price = m.american > 0 ? `+${m.american}` : `${m.american}`;
  const line = typeof m.line === "number" ? ` @ ${m.line}` : "";
  return `${m.selection}${line} (${price}, ${m.source})`;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function uniqueById<T extends { id: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x.id)) continue;
    seen.add(x.id);
    out.push(x);
  }
  return out;
}

function extractLegCount(question: string): number {
  const m = question.match(/(\d+)\s*leg/);
  if (!m) return 3;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 3;
  return Math.max(2, Math.min(6, Math.round(n)));
}

function isRandomParlayAsk(q: string): boolean {
  return /random.*parlay|build.*parlay|generate.*parlay|make.*parlay|best.*parlay/.test(q);
}

function isAutoSuggestAsk(q: string): boolean {
  return /suggest.*player|pick.*for me|no input|any players|random picks|best picks|suggest.*props|suggest.*bets/.test(q);
}

type ParlayObjective = "hit_chance" | "value_edge";
type ParsedParlayRequest = { legs: number; objective: ParlayObjective; minCombinedAmerican?: number };

function parseParlayRequest(q: string): ParsedParlayRequest {
  const legs = extractLegCount(q);
  const objective: ParlayObjective = /best edge|value|ev|expected value/.test(q) ? "value_edge" : "hit_chance";
  const m = q.match(/([+-]\d{2,4})\s*(combined|parlay)?\s*(price|odds)?/);
  const minCombinedAmerican = m ? Number(m[1]) : undefined;
  return { legs, objective, minCombinedAmerican };
}

function toSlipBet(m: Market): SlipBet {
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
    tierMin: m.tierMin
  };
}

function pickRandomParlay(pool: Market[], legs: number): Market[] {
  const copy = [...pool];
  const out: Market[] = [];
  while (copy.length && out.length < legs) {
    const idx = Math.floor(Math.random() * copy.length);
    const [m] = copy.splice(idx, 1);
    if (!m) continue;
    if (
      out.some(
        (x) =>
          (x.playerName ?? "").toLowerCase() === (m.playerName ?? "").toLowerCase() &&
          (x.marketType ?? "").toLowerCase() === (m.marketType ?? "").toLowerCase()
      )
    ) {
      continue;
    }
    out.push(m);
  }
  return out;
}

function combinedAmericanFromLegs(legs: SlipBet[]): number {
  const dec = legs.reduce((acc, x) => acc * americanToDecimal(x.oddsAmerican), 1);
  return decimalToAmerican(dec);
}

function satisfiesMinCombined(legs: SlipBet[], min?: number): boolean {
  if (min == null || !Number.isFinite(min)) return true;
  const combined = combinedAmericanFromLegs(legs);
  return combined >= min;
}

function formatParlayReport(sim: ReturnType<typeof runSimulation1000>, legs: SlipBet[]): string {
  const combinedAmerican = combinedAmericanFromLegs(legs);
  const combinedLabel = combinedAmerican > 0 ? `+${combinedAmerican}` : `${combinedAmerican}`;
  const lines = sim.results.map((r) => {
    const bet = legs.find((b) => b.id === r.betId);
    const p = r.edge > 0 ? `+${(r.edge * 100).toFixed(1)}` : `${(r.edge * 100).toFixed(1)}`;
    return `- ${bet?.selection ?? r.betId}: hit ${(r.hitProbability * 100).toFixed(2)}%, implied ${(r.impliedProbability * 100).toFixed(2)}%, edge ${p} pts, EV ${r.expectedValue.toFixed(2)}u, units ${r.suggestedUnits}`;
  });
  return [
    `Best generated parlay hit chance: ${(sim.parlayHitProbability * 100).toFixed(3)}%`,
    `Combined parlay price from live legs: ${combinedLabel}`,
    "Real probability report from simulator (using live sportsbook odds for these legs):",
    ...lines
  ].join("\n");
}

function buildParlayReport(sim: ReturnType<typeof runSimulation1000>, legs: SlipBet[]): ParlayReport {
  const byId = new Map(sim.results.map((r) => [r.betId, r]));
  return {
    parlayHitProbability: sim.parlayHitProbability,
    combinedAmerican: combinedAmericanFromLegs(legs),
    legs: legs.map((b) => {
      const r = byId.get(b.id)!;
      return {
        selection: b.selection,
        oddsAmerican: b.oddsAmerican,
        hitProbability: r.hitProbability,
        impliedProbability: r.impliedProbability,
        edge: r.edge,
        expectedValue: r.expectedValue,
        suggestedUnits: r.suggestedUnits
      };
    })
  };
}

function questionMentionsBet(question: string, bet: SlipBet): boolean {
  const q = question.toLowerCase();
  const idHit = q.includes(String(bet.id).toLowerCase());
  const sel = String(bet.selection ?? "").toLowerCase();
  const player = String(bet.playerName ?? "").toLowerCase();
  const playerHit = player.length > 2 && q.includes(player);
  const selectionHit = sel.length > 4 && q.includes(sel.slice(0, Math.min(26, sel.length)));
  return idHit || playerHit || selectionHit;
}

async function fetchLiveSportsbookMarkets(): Promise<Market[]> {
  const provider = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
  if (provider === "rundown") {
    return fetchRundownMarketsForToday();
  }
  const [games, events] = await Promise.all([getDailySchedule(), fetchMlbOddsEvents()]);
  if (!games.length || !events.length) return [];
  const playerProps = buildPlayerPropsFromOddsEvents(events, games);
  return playerProps.filter((m) => isSportsbookLineSource(m.source));
}

function toMarketFromSlipBet(b: SlipBet): Market {
  return {
    id: b.id,
    gameId: b.gameId,
    marketType: b.marketType,
    selection: b.selection,
    line: b.line ?? null,
    american: b.oddsAmerican,
    source: "manual",
    playerName: b.playerName,
    statKey: b.statKey,
    pickKind: b.pickKind,
    tierMin: b.tierMin ?? null
  };
}

function findPlayerPropsFromQuestion(markets: Market[], question: string): Market[] {
  const qn = normalize(question);
  const qWords = qn.split(" ").filter((x) => x.length >= 3);
  const scored = markets
    .filter((m) => !!m.playerName)
    .map((m) => {
      const pn = normalize(String(m.playerName ?? ""));
      let score = 0;
      for (const w of qWords) if (pn.includes(w)) score += 1;
      if (qn.includes(pn) && pn.length > 4) score += 3;
      return { m, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m);
  return uniqueById(scored);
}

function topMarketsSnapshot(markets: Market[], count = 12): Market[] {
  const player = markets.filter((m) => m.marketType.startsWith("player_"));
  const core = player.length ? player : markets;
  return uniqueById(core).slice(0, count);
}

async function duckDuckGoSummary(question: string): Promise<string | null> {
  try {
    const u = `https://api.duckduckgo.com/?q=${encodeURIComponent(question)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(u, { next: { revalidate: 120 } });
    if (!res.ok) return null;
    const data = await res.json();
    const abstract = String(data?.AbstractText ?? "").trim();
    const heading = String(data?.Heading ?? "").trim();
    const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    const firstRelated = related.find((x: any) => typeof x?.Text === "string")?.Text ?? "";
    if (abstract) return `${heading ? `${heading}: ` : ""}${abstract}`;
    if (firstRelated) return String(firstRelated);
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    const rl = rateLimit(`coach:${ip}`, 40, 60_000);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

    const body = (await req.json()) as CoachReq;
    const question = String(body.question ?? "").trim();
    const payload = body.payload ?? {};
    if (!question) return NextResponse.json({ answer: "Ask a question and I will break it down from your slip and current markets." });

    const q = question.toLowerCase();
    const rows = payload.results ?? [];

    if (q.includes("safest")) {
      const safest = [...rows].sort((a, b) => b.hitProbability - a.hitProbability)[0];
      if (safest) {
        return NextResponse.json({
          answer: `Safest leg profile in this run is ${safest.betId} at ${(safest.hitProbability * 100).toFixed(1)}% hit rate with ${safest.suggestedUnits}u suggested size.`
        });
      }
    }

    if (q.includes("parlay") && (q.includes("chance") || q.includes("hit") || q.includes("prob"))) {
      const p = Number(payload.parlayHitProbability ?? 0);
      return NextResponse.json({
        answer: `Your current full-ticket parlay hit estimate is ${(p * 100).toFixed(2)}%. If you want safer construction, trim the lowest hit-rate leg first.`
      });
    }

    const manualBet = (payload.bets ?? []).find((b) => questionMentionsBet(q, b));
    if (manualBet && Number.isFinite(Number(manualBet.oddsAmerican))) {
      const p = Number(manualBet.oddsAmerican);
      const show = p > 0 ? `+${p}` : `${p}`;
      return NextResponse.json({
        answer:
          `Using your manual in-app override for this leg: ${manualBet.selection} at ${show}. ` +
          `Per your setting, coach prioritizes your manually edited odds for that selection.`,
        sources: ["manual-override"]
      });
    }

    const liveMarkets = await fetchLiveSportsbookMarkets();
    if (liveMarkets.length) {
      lastGoodSportsbookProps = { at: Date.now(), markets: liveMarkets };
    }
    const cacheValid =
      !!lastGoodSportsbookProps && Date.now() - lastGoodSportsbookProps.at < LAST_GOOD_PROPS_TTL_MS;
    const markets = liveMarkets.length
      ? liveMarkets
      : cacheValid
        ? (lastGoodSportsbookProps?.markets ?? [])
        : [];
    const usingCachedReal = !liveMarkets.length && cacheValid;

    if (isRandomParlayAsk(q) || isAutoSuggestAsk(q)) {
      const req = parseParlayRequest(q);
      const legs = req.legs;
      const sportsbookPlayerPool = uniqueById(markets.filter((m) => m.marketType.startsWith("player_"))).slice(0, 240);
      const sportsbookAnyPool = uniqueById(markets).slice(0, 260);
      const slipPlayerPool = uniqueById((payload.bets ?? []).map(toMarketFromSlipBet).filter((m) => m.marketType.startsWith("player_")));
      // Strict odds policy: sportsbook live feed first, user manual overrides second; no model pool fallback.
      const propPool = sportsbookPlayerPool.length
        ? sportsbookPlayerPool
        : sportsbookAnyPool.length >= legs
          ? sportsbookAnyPool
          : slipPlayerPool;

      if (propPool.length < legs) {
        const provider = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
        const dbg = provider === "rundown" ? getRundownDebugState() : getOddsDebugState();
        return NextResponse.json({
          answer:
            `I could not build a ${legs}-leg parlay from real sportsbook odds right now. ` +
            `Available sportsbook/manual player-prop pool: ${propPool.length}. Feed state: ${dbg.status}.`,
          sources: ["parlay-generator", `odds-debug:${dbg.status}`]
        });
      }
      let best:
        | {
            picks: SlipBet[];
            sim: ReturnType<typeof runSimulation1000>;
          }
        | undefined;
      for (let i = 0; i < 220; i++) {
        const picks = pickRandomParlay(propPool, legs).map(toSlipBet);
        if (picks.length < legs) continue;
        if (!satisfiesMinCombined(picks, req.minCombinedAmerican)) continue;
        const sim = runSimulation1000(picks, { iterations: 1200 });
        if (!best) {
          best = { picks, sim };
          continue;
        }
        if (req.objective === "hit_chance") {
          if (sim.parlayHitProbability > best.sim.parlayHitProbability) best = { picks, sim };
        } else {
          const simEdge = sim.results.reduce((acc, x) => acc + x.edge, 0);
          const bestEdge = best.sim.results.reduce((acc, x) => acc + x.edge, 0);
          if (simEdge > bestEdge) best = { picks, sim };
        }
      }
      if (!best) {
        return NextResponse.json({
          answer: "I could not generate a valid random parlay sample this run. Try again and I will regenerate."
        });
      }
      const sourceLabel = (sportsbookPlayerPool.length || sportsbookAnyPool.length >= legs)
        ? usingCachedReal
          ? "last-good-live-sportsbook-snapshot"
          : "live-sportsbook-feed"
        : slipPlayerPool.length
          ? "manual-slip-player-fallback"
          : "no-real-odds-available";
      const poolLabel = sportsbookPlayerPool.length
        ? "player-prop-pool"
        : sportsbookAnyPool.length >= legs
          ? "sportsbook-any-market-pool"
          : "manual-player-pool";
      const modeLabel = isAutoSuggestAsk(q) ? "auto-suggest-mode" : "random-command-mode";
      return NextResponse.json({
        answer:
          `${isAutoSuggestAsk(q) ? "Auto-suggested parlay (no player input required):\n" : ""}` +
          formatParlayReport(best.sim, best.picks),
        parlayReport: buildParlayReport(best.sim, best.picks),
        sources: ["the-odds-api:fanduel,draftkings", "sim-engine", sourceLabel, poolLabel, modeLabel]
      });
    }

    const playerProps = findPlayerPropsFromQuestion(markets, q);
    if (playerProps.length) {
      const top = playerProps.slice(0, 24);
      const oddsLines = top.map((m) => `- ${fmtLine(m)}`).join("\n");
      const who = top[0]?.playerName ?? "that player";
      return NextResponse.json({
        answer:
          `Live props currently available for ${who} (all props found from sportsbook feed):\n${oddsLines}\n` +
          `Ask for a random parlay any time and I will generate/simulate one from current live props.`,
        sources: [
          "the-odds-api:fanduel,draftkings",
          usingCachedReal ? "last-good-live-sportsbook-snapshot" : "live-sportsbook-feed"
        ]
      });
    }

    const qWords = toWords(q);
    const statHints = inferStatHints(q);
    const ranked = [...markets]
      .map((m) => ({ m, score: marketMatchScore(m, qWords, statHints) }))
      .filter((x) => x.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map((x) => x.m);

    if (ranked.length) {
      const oddsLines = ranked.map((m) => `- ${fmtLine(m)}`).join("\n");
      return NextResponse.json({
        answer:
          `Here are current matching real-time sportsbook lines (FanDuel/DraftKings feed):\n${oddsLines}\n` +
          `Coach used live sportsbook odds first, and only falls back to manual app odds when you override a leg.`,
        sources: [
          "the-odds-api:fanduel,draftkings",
          usingCachedReal ? "last-good-live-sportsbook-snapshot" : "live-sportsbook-feed"
        ]
      });
    }

    const webSummary = await duckDuckGoSummary(question);
    if (webSummary) {
      return NextResponse.json({
        answer:
          `${webSummary}\n\nI did not find a direct matching live prop line for that exact query right now. ` +
          `For odds, I only trust live sportsbook feeds (or your manual override when you edit a leg).`,
        sources: ["duckduckgo-instant-answer", "live-sportsbook-required"]
      });
    }

    const snapshot = topMarketsSnapshot(markets, 12);
    if (snapshot.length) {
      const oddsLines = snapshot.map((m) => `- ${fmtLine(m)}`).join("\n");
      return NextResponse.json({
        answer:
          `I could not map that to one exact player/prop, so here is a live odds snapshot you can use right now:\n${oddsLines}\n` +
          `If you give player + stat (example: 'Mookie Betts total bases'), I will narrow it instantly.`,
        sources: [
          usingCachedReal ? "last-good-live-sportsbook-snapshot" : "live-sportsbook-feed",
          "broad-odds-snapshot"
        ]
      });
    }

    const provider = String(process.env.ODDS_PROVIDER ?? "").toLowerCase();
    const dbg = provider === "rundown" ? getRundownDebugState() : getOddsDebugState();
    const slipSnapshot = uniqueById((payload.bets ?? []).map(toMarketFromSlipBet));
    const broadPool = uniqueById(
      [...markets.filter((m) => m.marketType.startsWith("player_")), ...slipSnapshot.filter((m) => m.marketType.startsWith("player_"))]
    );
    if (broadPool.length >= 2) {
      const legs = Math.min(4, Math.max(2, broadPool.length >= 3 ? 3 : 2));
      let best:
        | {
            picks: SlipBet[];
            sim: ReturnType<typeof runSimulation1000>;
          }
        | undefined;
      for (let i = 0; i < 160; i++) {
        const picks = pickRandomParlay(broadPool, legs).map(toSlipBet);
        if (picks.length < legs) continue;
        const sim = runSimulation1000(picks, { iterations: 1200 });
        if (!best || sim.parlayHitProbability > best.sim.parlayHitProbability) best = { picks, sim };
      }
      if (best) {
        return NextResponse.json({
          answer:
            `I auto-generated a best-available parlay since exact text matching was weak:\n` +
            `${formatParlayReport(best.sim, best.picks)}`,
          parlayReport: buildParlayReport(best.sim, best.picks),
          sources: ["auto-fallback-parlay", `odds-debug:${dbg.status}`]
        });
      }
    }

    if (slipSnapshot.length) {
      const lines = slipSnapshot.slice(0, 10).map((m) => `- ${fmtLine(m)}`).join("\n");
      return NextResponse.json({
        answer:
          `I could not map exact phrasing, but here are all currently available odds from your active slip:\n${lines}\n` +
          `Add at least 2 player props in your slip and I will auto-generate a simulated parlay immediately.`,
        sources: ["active-slip-snapshot", `odds-debug:${dbg.status}`]
      });
    }
    return NextResponse.json({
      answer:
        "No exact player/prop match was found from this phrasing. Try player + stat (example: 'Juan Soto total bases odds today') or ask for a random parlay command and I will generate one instantly.",
      sources: [`odds-debug:${dbg.status}`]
    });
  } catch (e) {
    return NextResponse.json({
      answer:
        `Coach hit an internal error (${e instanceof Error ? e.message : String(e)}). ` +
        `I still recommend re-running your request; endpoint is designed to recover on the next call.`
    });
  }
}

