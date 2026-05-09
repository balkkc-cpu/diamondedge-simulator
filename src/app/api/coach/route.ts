import { NextRequest, NextResponse } from "next/server";
import { getAllMarkets } from "@/lib/apiClients";
import { oddsProviderForSport, parseSportCode, type SportCode } from "@/lib/sportContext";
import { createSeededRng, hashSeed, pickDiverseParlayMarkets, slipSignatureFromMarketIds } from "@/lib/parlaySampling";
import { rateLimit } from "@/lib/rateLimit";
import { americanToDecimal, decimalToAmerican, isPlayerPropMarketType, isSportsbookLineSource } from "@/lib/odds";
import { runSimulation1000 } from "@/lib/simEngine";
import { getOddsDebugState } from "@/lib/theOddsFanDuel";
import { getRundownDebugState } from "@/lib/theRundown";
import type { Market, SlipBet } from "@/lib/types";

type CoachReq = {
  question?: string;
  /** `mlb` (default) or `nba` — same board/env split as dashboard. */
  sport?: string;
  history?: Array<{ role: "user" | "coach"; text: string }>;
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

/** Assistant-style formatting (plain text, clear sections — not affiliated with third-party chat products). */
function formatAssistantReply(
  answer: string,
  opts?: { quickTake?: string; followUp?: string; caveat?: string }
): string {
  const blocks: string[] = [];
  if (opts?.quickTake) blocks.push(`Short answer\n${opts.quickTake}`);
  blocks.push(answer.trim());
  if (opts?.caveat) blocks.push(`Heads-up\n${opts.caveat}`);
  if (opts?.followUp) blocks.push(`Want to go deeper?\n${opts.followUp}`);
  return blocks.filter(Boolean).join("\n\n");
}

const recentCoachParlayLegIds = new Map<string, { ids: string[]; at: number }>();
const RECENT_PARLAY_TTL_MS = 1000 * 60 * 15;
const MAX_RECENT_PARLAY_IDS = 48;

function exclusionIdsForClient(ip: string): Set<string> {
  const row = recentCoachParlayLegIds.get(ip);
  if (!row || Date.now() - row.at > RECENT_PARLAY_TTL_MS) return new Set();
  return new Set(row.ids);
}

function rememberCoachParlay(ip: string, legIds: string[]) {
  const prev = recentCoachParlayLegIds.get(ip);
  const merged = Array.from(new Set([...(prev?.ids ?? []), ...legIds]));
  recentCoachParlayLegIds.set(ip, { ids: merged.slice(-MAX_RECENT_PARLAY_IDS), at: Date.now() });
}

function enrichQuestionWithHistory(
  question: string,
  history: Array<{ role: "user" | "coach"; text: string }>
): string {
  const q = question.trim();
  if (!q) return q;
  const lower = q.toLowerCase();
  const looksFollowUp =
    lower.startsWith("what about") ||
    lower.startsWith("and ") ||
    lower.startsWith("also ") ||
    lower.includes("same game") ||
    lower.includes("that one") ||
    lower.includes("that leg") ||
    lower.includes("this one") ||
    lower === "why?" ||
    lower === "why";
  if (!looksFollowUp) return q;
  const lastUser = [...history].reverse().find((x) => x.role === "user" && x.text.trim());
  if (!lastUser) return q;
  return `${q} (context from prior user message: "${lastUser.text.trim()}")`;
}

let lastGoodSportsbookProps: { at: number; markets: Market[]; sport: SportCode } | null = null;
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
  if (isPlayerPropMarketType(m.marketType)) score += 1;
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

function isSmallTalkAsk(q: string): boolean {
  return /^(yo|hey|hi|hello|sup|what'?s up|hows it going|how are you|whats up coach|what's up coach)[\s!?]*$/.test(q.trim());
}

function isOddsLookupIntent(q: string): boolean {
  return /odds|line|lines|prop|props|parlay|pick|bet|player|hit chance|edge|ev|value|safest|build|generate/.test(q);
}

function isSaneCoachMarket(m: Market): boolean {
  if (!Number.isFinite(m.american)) return false;
  // Filter out ultra-lottery and highly stale-looking prices unless explicitly requested.
  if (m.american > 450 || m.american < -500) return false;
  if (typeof m.line !== "number") return true;
  if (m.marketType === "player_hits" && m.line > 2.5) return false;
  if (m.marketType === "player_tb" && m.line > 4.5) return false;
  if (m.marketType === "player_rbi" && m.line > 2.5) return false;
  if (m.marketType === "player_hr" && m.line > 1.5) return false;
  return true;
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

function combinedAmericanFromLegs(legs: SlipBet[]): number {
  const dec = legs.reduce((acc, x) => acc * americanToDecimal(x.oddsAmerican), 1);
  return decimalToAmerican(dec);
}

function satisfiesMinCombined(legs: SlipBet[], min?: number): boolean {
  if (min == null || !Number.isFinite(min)) return true;
  const combined = combinedAmericanFromLegs(legs);
  return combined >= min;
}

function pickStochasticParlay(args: {
  propPool: Market[];
  legs: number;
  objective: ParlayObjective;
  minCombinedAmerican?: number;
  baseSeed: number;
  excludeIds: Set<string>;
}):
  | {
      picks: SlipBet[];
      sim: ReturnType<typeof runSimulation1000>;
    }
  | undefined {
  const { propPool, legs, objective, minCombinedAmerican, baseSeed, excludeIds } = args;
  type Cand = { picks: SlipBet[]; sim: ReturnType<typeof runSimulation1000>; sig: string };
  const seen = new Set<string>();
  const collected: Cand[] = [];
  const trials = 380;

  for (let i = 0; i < trials; i++) {
    const rng = createSeededRng(hashSeed([String(baseSeed), String(i), "parlay"]));
    const raw = pickDiverseParlayMarkets(propPool, legs, rng, { excludeIds });
    const picks = raw.map(toSlipBet);
    if (picks.length < legs) continue;
    if (!satisfiesMinCombined(picks, minCombinedAmerican)) continue;
    const sig = slipSignatureFromMarketIds(picks.map((p) => p.id));
    if (seen.has(sig)) continue;
    seen.add(sig);
    const sim = runSimulation1000(picks, { iterations: 1200 });
    collected.push({ picks, sim, sig });
  }

  if (!collected.length) return undefined;

  collected.sort((a, b) => {
    if (objective === "hit_chance") {
      return b.sim.parlayHitProbability - a.sim.parlayHitProbability;
    }
    const ae = a.sim.results.reduce((acc, x) => acc + x.edge, 0);
    const be = b.sim.results.reduce((acc, x) => acc + x.edge, 0);
    return be - ae;
  });

  const topK = 22;
  const band = collected.slice(0, Math.min(topK, collected.length));
  const pickRng = createSeededRng(hashSeed([String(baseSeed), "pick", String(collected.length)]));
  const idx = band.length <= 1 ? 0 : Math.floor(pickRng() * band.length);
  const chosen = band[idx] ?? collected[0];
  return chosen ? { picks: chosen.picks, sim: chosen.sim } : undefined;
}

function formatParlayReport(sim: ReturnType<typeof runSimulation1000>, legs: SlipBet[]): string {
  const combinedAmerican = combinedAmericanFromLegs(legs);
  const combinedLabel = combinedAmerican > 0 ? `+${combinedAmerican}` : `${combinedAmerican}`;
  const gameIds = new Set(legs.map((l) => l.gameId));
  const diversity =
    legs.length >= 2
      ? `Leg mix: ${gameIds.size} different game${gameIds.size === 1 ? "" : "s"}, varied prop types where the board allows.`
      : "";
  const lines = sim.results.map((r) => {
    const bet = legs.find((b) => b.id === r.betId);
    const p = r.edge > 0 ? `+${(r.edge * 100).toFixed(1)}` : `${(r.edge * 100).toFixed(1)}`;
    return `- ${bet?.selection ?? r.betId}: hit ${(r.hitProbability * 100).toFixed(2)}%, implied ${(r.impliedProbability * 100).toFixed(2)}%, edge ${p} pts, EV ${r.expectedValue.toFixed(2)}u, units ${r.suggestedUnits}`;
  });
  return [
    `Modeled parlay hit chance: ${(sim.parlayHitProbability * 100).toFixed(3)}%`,
    `Combined parlay price from live legs: ${combinedLabel}`,
    ...(diversity ? [diversity] : []),
    "Simulator detail (real sportsbook odds on these legs):",
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

async function fetchLiveSportsbookMarkets(sport: SportCode): Promise<Market[]> {
  const board = await getAllMarkets(sport);
  const book = board.filter((m) => isSportsbookLineSource(m.source));
  if (book.length) return book;
  /** Rundown 429 / no key: still run coach + parlays off model/mock board (simulation-only). */
  return board.filter((m) => m.source === "model" || m.source === "mock");
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
  const player = markets.filter((m) => isPlayerPropMarketType(m.marketType));
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
    const instant = String(data?.Answer ?? "").trim();
    const related = Array.isArray(data?.RelatedTopics) ? data.RelatedTopics : [];
    const firstRelated = related.find((x: any) => typeof x?.Text === "string")?.Text ?? "";
    if (abstract) return `${heading ? `${heading}: ` : ""}${abstract}`;
    if (instant) return instant.length > 400 ? `${instant.slice(0, 397)}…` : instant;
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
    const sport = parseSportCode(body.sport);
    const question = String(body.question ?? "").trim();
    const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
    const payload = body.payload ?? {};
    if (!question)
      return NextResponse.json({
        answer: formatAssistantReply("Ask me anything about props, lines, your slip, or a parlay build — I’ll use live board data and the simulator when it applies.")
      });

    const resolvedQuestion = enrichQuestionWithHistory(question, history);
    const q = resolvedQuestion.toLowerCase();
    const rows = payload.results ?? [];
    const explicitLottoIntent = /lotto|longshot|long shot|high risk|boom or bust|hail mary/.test(q);

    if (isSmallTalkAsk(q)) {
      return NextResponse.json({
        answer: formatAssistantReply(
          "Hey — I’m here to talk through the board like a sharp friend: props, edges, bankroll framing, and sim-backed parlays. Say what you want to chase (safer 2-leg, value 3-leg, or news angles) and we’ll go from there.",
          {
            quickTake: "Casual chat is fine; I only fire bet ideas when you ask.",
            followUp: "give me a fresh random 3-leg with different players than last time"
          }
        ),
        sources: ["chat-mode"]
      });
    }

    if (q.includes("safest")) {
      const safest = [...rows].sort((a, b) => b.hitProbability - a.hitProbability)[0];
      if (safest) {
        return NextResponse.json({
          answer: formatAssistantReply(
            `Safest leg profile in this run is ${safest.betId} at ${(safest.hitProbability * 100).toFixed(1)}% hit rate with ${safest.suggestedUnits}u suggested size.`,
            {
              quickTake: "Prioritize the highest hit-rate leg for lower variance.",
              followUp: "show me the safest 3-leg combo instead of a single leg"
            }
          )
        });
      }
    }

    if (q.includes("parlay") && (q.includes("chance") || q.includes("hit") || q.includes("prob"))) {
      const p = Number(payload.parlayHitProbability ?? 0);
      return NextResponse.json({
        answer: formatAssistantReply(
          `Your current full-ticket parlay hit estimate is ${(p * 100).toFixed(2)}%. If you want safer construction, trim the lowest hit-rate leg first.`,
          {
            quickTake: p >= 0.2 ? "This is viable for a parlay profile." : "This is a low-hit profile; consider reducing legs.",
            followUp: "which leg should I cut first to improve hit chance"
          }
        )
      });
    }

    const manualBet = (payload.bets ?? []).find((b) => questionMentionsBet(q, b));
    if (manualBet && Number.isFinite(Number(manualBet.oddsAmerican))) {
      const p = Number(manualBet.oddsAmerican);
      const show = p > 0 ? `+${p}` : `${p}`;
      return NextResponse.json({
        answer: formatAssistantReply(
          `Using your manual in-app override for this leg: ${manualBet.selection} at ${show}. ` +
            `Per your setting, coach prioritizes your manually edited odds for that selection.`,
          { followUp: "compare this manual price versus live book price" }
        ),
        sources: ["manual-override"]
      });
    }

    const liveMarkets = await fetchLiveSportsbookMarkets(sport);
    const bookOnlyLive = liveMarkets.filter((m) => isSportsbookLineSource(m.source));
    if (bookOnlyLive.length) {
      lastGoodSportsbookProps = { at: Date.now(), markets: bookOnlyLive, sport };
    }
    const cacheValid =
      !!lastGoodSportsbookProps &&
      lastGoodSportsbookProps.sport === sport &&
      Date.now() - lastGoodSportsbookProps.at < LAST_GOOD_PROPS_TTL_MS;
    const rawMarkets = liveMarkets.length
      ? liveMarkets
      : cacheValid
        ? (lastGoodSportsbookProps?.markets ?? [])
        : [];
    const markets = explicitLottoIntent ? rawMarkets : rawMarkets.filter(isSaneCoachMarket);
    const usingCachedReal = !liveMarkets.length && cacheValid;

    if (isRandomParlayAsk(q) || isAutoSuggestAsk(q)) {
      const req = parseParlayRequest(q);
      const legs = req.legs;
      const sportsbookPlayerPool = uniqueById(markets.filter((m) => isPlayerPropMarketType(m.marketType))).slice(0, 240);
      const sportsbookAnyPool = uniqueById(markets).slice(0, 260);
      const slipPlayerPool = uniqueById((payload.bets ?? []).map(toMarketFromSlipBet).filter((m) => isPlayerPropMarketType(m.marketType)));
      // Sportsbook feed first; when empty (Rundown 429 / no keys), markets include model/mock so coach still works.
      const propPool = sportsbookPlayerPool.length
        ? sportsbookPlayerPool
        : sportsbookAnyPool.length >= legs
          ? sportsbookAnyPool
          : slipPlayerPool;

      if (propPool.length < legs) {
        const provider = oddsProviderForSport(sport);
        const dbg = provider === "rundown" ? getRundownDebugState() : getOddsDebugState();
        return NextResponse.json({
          answer: formatAssistantReply(
            `I could not build a ${legs}-leg parlay from real sportsbook odds right now. ` +
              `Available sportsbook/manual player-prop pool: ${propPool.length}. Feed state: ${dbg.status}.`,
            {
              quickTake: "Live feed depth is limited at the moment.",
              followUp: "build the best available 2-leg until live props recover",
              caveat: "Odds API credits or upstream limits can temporarily reduce the pool."
            }
          ),
          sources: ["parlay-generator", `odds-debug:${dbg.status}`]
        });
      }
      const rotateIntent = /another|different|shuffle|give me a new|try again|fresh parlay|new parlay|again/i.test(resolvedQuestion);
      const baseSeed = hashSeed([
        ip,
        resolvedQuestion,
        String(Date.now()),
        rotateIntent ? "rotate" : "run",
        JSON.stringify(history.slice(-8).map((h) => h.text))
      ]);
      let excludeIds = exclusionIdsForClient(ip);
      let best = pickStochasticParlay({
        propPool,
        legs,
        objective: req.objective,
        minCombinedAmerican: req.minCombinedAmerican,
        baseSeed,
        excludeIds
      });
      if (!best) {
        best = pickStochasticParlay({
          propPool,
          legs,
          objective: req.objective,
          minCombinedAmerican: req.minCombinedAmerican,
          baseSeed: baseSeed + 1337,
          excludeIds: new Set()
        });
      }
      if (!best) {
        return NextResponse.json({
          answer: formatAssistantReply(
            "I couldn’t assemble a valid parlay sample from the current board with your filters. Try again in a moment — the live prop pool shifts quickly.",
            { followUp: "build a safer 2-leg from what’s available right now" }
          )
        });
      }
      rememberCoachParlay(ip, best.picks.map((p) => p.id));
      const usedSimBoard = !markets.some((m) => isSportsbookLineSource(m.source));
      const sourceLabel = usedSimBoard
        ? "simulator-model-board"
        : sportsbookPlayerPool.length || sportsbookAnyPool.length >= legs
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
        answer: formatAssistantReply(
          `${isAutoSuggestAsk(q) ? "Auto-suggested parlay (no player input required):\n" : ""}` +
            formatParlayReport(best.sim, best.picks),
          {
            quickTake:
              req.objective === "value_edge"
                ? "Value-leaning draw; each ask rolls new legs (different players/games/props when the board allows)."
                : "New random draw from strong combos; repeats avoid yesterday’s leg IDs when possible.",
            followUp: "give me another parlay with totally different players than this one"
          }
        ),
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
        answer: formatAssistantReply(
          `Live props currently available for ${who} (all props found from sportsbook feed):\n${oddsLines}\n` +
            `Ask for a random parlay any time and I will generate/simulate one from current live props.`,
          { followUp: `build me a 3-leg parlay from these ${who} lines` }
        ),
        sources: [
          "the-odds-api:fanduel,draftkings",
          usingCachedReal ? "last-good-live-sportsbook-snapshot" : "live-sportsbook-feed"
        ]
      });
    }

    if (!isOddsLookupIntent(q)) {
      return NextResponse.json({
        answer: formatAssistantReply(
          "I am ready. Give me team/player + what you want (safe hit-rate build, value build, or odds lookup), and I will answer in that mode.",
          {
            quickTake: "No forced picks on casual chat.",
            followUp: "show safe props for Yankees hitters tonight"
          }
        ),
        sources: ["chat-mode"]
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
        answer: formatAssistantReply(
          `Here are current matching real-time sportsbook lines (FanDuel/DraftKings feed):\n${oddsLines}\n` +
            `Coach used live sportsbook odds first, and only falls back to manual app odds when you override a leg.`,
          { followUp: "rank these options by hit probability and edge" }
        ),
        sources: [
          "the-odds-api:fanduel,draftkings",
          usingCachedReal ? "last-good-live-sportsbook-snapshot" : "live-sportsbook-feed"
        ]
      });
    }

    const webSummary = await duckDuckGoSummary(question);
    if (webSummary) {
      return NextResponse.json({
        answer: formatAssistantReply(
          `${webSummary}\n\nI did not find a direct matching live prop line for that exact query right now. ` +
            `For odds, I only trust live sportsbook feeds (or your manual override when you edit a leg).`,
          { followUp: "show available live props for this player right now" }
        ),
        sources: ["duckduckgo-instant-answer", "live-sportsbook-required"]
      });
    }

    const snapshot = topMarketsSnapshot(markets, 12);
    if (snapshot.length) {
      const oddsLines = snapshot.map((m) => `- ${fmtLine(m)}`).join("\n");
      return NextResponse.json({
        answer: formatAssistantReply(
          `I could not map that to one exact player/prop, so here is a live odds snapshot you can use right now:\n${oddsLines}\n` +
            `If you give player + stat (example: 'Mookie Betts total bases'), I will narrow it instantly.`,
          { followUp: "use this snapshot to build safest 3-leg parlay" }
        ),
        sources: [
          usingCachedReal ? "last-good-live-sportsbook-snapshot" : "live-sportsbook-feed",
          "broad-odds-snapshot"
        ]
      });
    }

    const provider = oddsProviderForSport(sport);
    const dbg = provider === "rundown" ? getRundownDebugState() : getOddsDebugState();
    const slipSnapshot = uniqueById((payload.bets ?? []).map(toMarketFromSlipBet));
    const broadPool = uniqueById(
      [...markets.filter((m) => isPlayerPropMarketType(m.marketType)), ...slipSnapshot.filter((m) => isPlayerPropMarketType(m.marketType))]
    );
    if (broadPool.length >= 2) {
      const legs = Math.min(4, Math.max(2, broadPool.length >= 3 ? 3 : 2));
      const fbSeed = hashSeed([ip, resolvedQuestion, "fallback-parlay", String(Date.now())]);
      let best = pickStochasticParlay({
        propPool: broadPool,
        legs,
        objective: "hit_chance",
        baseSeed: fbSeed,
        excludeIds: exclusionIdsForClient(ip)
      });
      if (!best) {
        best = pickStochasticParlay({
          propPool: broadPool,
          legs,
          objective: "hit_chance",
          baseSeed: fbSeed + 2048,
          excludeIds: new Set()
        });
      }
      if (best) {
        rememberCoachParlay(ip, best.picks.map((p) => p.id));
        return NextResponse.json({
          answer: formatAssistantReply(
            `Here’s a fresh build from the best-available player-prop pool (text didn’t match a single prop):\n` +
              `${formatParlayReport(best.sim, best.picks)}`,
            { quickTake: "Different games/props when the board allows; each ask uses a new random draw." }
          ),
          parlayReport: buildParlayReport(best.sim, best.picks),
          sources: ["auto-fallback-parlay", `odds-debug:${dbg.status}`]
        });
      }
    }

    if (slipSnapshot.length) {
      const lines = slipSnapshot.slice(0, 10).map((m) => `- ${fmtLine(m)}`).join("\n");
      return NextResponse.json({
        answer: formatAssistantReply(
          `I could not map exact phrasing, but here are all currently available odds from your active slip:\n${lines}\n` +
            `Add at least 2 player props in your slip and I will auto-generate a simulated parlay immediately.`,
          { followUp: "build best available parlay from my active slip" }
        ),
        sources: ["active-slip-snapshot", `odds-debug:${dbg.status}`]
      });
    }
    return NextResponse.json({
      answer: formatAssistantReply(
        "No exact player/prop match was found from this phrasing. Try player + stat (example: 'Juan Soto total bases odds today') or ask for a random parlay command and I will generate one instantly.",
        { followUp: "best random 3-leg parlay from live board" }
      ),
      sources: [`odds-debug:${dbg.status}`]
    });
  } catch (e) {
    return NextResponse.json({
      answer: formatAssistantReply(
        `Coach hit an internal error (${e instanceof Error ? e.message : String(e)}). ` +
          `I still recommend re-running your request; endpoint is designed to recover on the next call.`,
        { quickTake: "Temporary server-side issue.", followUp: "retry last request" }
      )
    });
  }
}

