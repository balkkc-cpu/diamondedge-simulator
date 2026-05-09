"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BetSlip } from "@/components/BetSlip";
import { GameLinesRow, PlayerPropColumns } from "@/components/PlayerPropColumns";
import { PlayerTabsBoard } from "@/components/PlayerTabsBoard";
import { useBetStore } from "@/store/betStore";
import { GameCard, Market, SlipBet } from "@/lib/types";
import { isPlayerPropMarketType, isSportsbookLineSource } from "@/lib/odds";
import type { OddsDebugState } from "@/lib/theOddsFanDuel";
import type { RundownDebugState } from "@/lib/theRundown";

function gameFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("game");
}

export default function BetBuilderPage() {
  const urlGameRef = useRef<string | null>(null);
  if (urlGameRef.current === null && typeof window !== "undefined") {
    urlGameRef.current = gameFromUrl();
  }

  const [data, setData] = useState<{
    games: GameCard[];
    allMarkets: Market[];
    oddsProvider?: "rundown" | "the_odds_api";
    oddsDebug?: OddsDebugState | RundownDebugState;
    boardStats?: {
      slateGames: number;
      markets: number;
      bookPlayerProps: number;
      orphanBookPlayerProps: number;
      bookPlayerPropsByGameId: Record<string, number>;
    };
  } | null>(null);
  const [gameId, setGameId] = useState<string>("mock-game-001");
  const [marketFilter, setMarketFilter] = useState<"all" | "lines" | "players_tabs" | "players_columns">("all");
  const [running, setRunning] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const { bets, addBet, loadSlip } = useBetStore();

  const loadDashboard = useCallback(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((payload) => {
        setData(payload);
        setGameId((gid) => {
          const nextGames = (payload.games ?? []) as GameCard[];
          const pref = urlGameRef.current;
          if (pref && nextGames.some((g) => g.id === pref)) return pref;
          return nextGames.some((g) => g.id === gid) ? gid : nextGames[0]?.id ?? "mock-game-001";
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const t = window.setInterval(loadDashboard, 60_000);
    return () => window.clearInterval(t);
  }, [loadDashboard]);

  useEffect(() => {
    const raw = sessionStorage.getItem("diamondedge_load_slip");
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as { bets: SlipBet[]; bankroll: number; unitSize: number };
      if (Array.isArray(d.bets)) loadSlip(d.bets, Number(d.bankroll) || 1000, Number(d.unitSize) || 25);
    } catch {
      /* ignore */
    }
    sessionStorage.removeItem("diamondedge_load_slip");
  }, [loadSlip]);

  const forGame = useMemo(() => (data?.allMarkets ?? []).filter((m) => m.gameId === gameId), [data, gameId]);
  const sportsbookForGame = useMemo(() => forGame.filter((m) => isSportsbookLineSource(m.source)), [forGame]);
  /** Book lines first; if feeds are empty (e.g. Rundown 429 + no Odds key), show model game lines so the board is still usable. */
  const lineMarkets = useMemo(() => {
    const fromBook = sportsbookForGame.filter((m) => !isPlayerPropMarketType(m.marketType));
    if (fromBook.length) return fromBook;
    return forGame.filter((m) => m.source === "model" && !isPlayerPropMarketType(m.marketType));
  }, [forGame, sportsbookForGame]);
  const playerMarkets = useMemo(
    () => sportsbookForGame.filter((m) => isPlayerPropMarketType(m.marketType)),
    [sportsbookForGame]
  );
  const usingModelGameLines = useMemo(() => {
    const bookGameLines = sportsbookForGame.filter((m) => !isPlayerPropMarketType(m.marketType));
    return bookGameLines.length === 0 && lineMarkets.length > 0;
  }, [sportsbookForGame, lineMarkets]);
  const oddsDebug = data?.oddsDebug;

  const playerPropsEmptyHint = useMemo(() => {
    const totalBook = data?.boardStats?.bookPlayerProps ?? 0;
    const fromRundown = data?.oddsProvider === "rundown";
    const rd = fromRundown ? (data?.oddsDebug as RundownDebugState | undefined) : undefined;
    const rundown429 = rd?.status === "http_error" && rd?.httpStatus === 429;

    if (totalBook > 0) {
      return "Sportsbook player props exist for other games on today’s slate, but none are attached to this game yet (often a temporary event↔game mapping gap right after a rate-limited Rundown fetch). Try another matchup or refresh in a few minutes.";
    }
    if (fromRundown && rundown429) {
      return "The Rundown API returned HTTP 429 (rate limit). This deployment now waits and retries longer, and caches Rundown HTTP responses longer by default. If props stay empty, set ODDS_API_KEY so The Odds API can serve the board when Rundown fails, or raise RUNDOWN_FETCH_REVALIDATE_SECONDS (for example 1800–3600) in Vercel.";
    }
    return "Live sportsbook player props are temporarily unavailable from the current feed. No synthetic fallback props are shown.";
  }, [data?.boardStats?.bookPlayerProps, data?.oddsDebug, data?.oddsProvider]);

  const oddsBadge = useMemo(() => {
    if (!oddsDebug) return null;
    const fromRundown = data?.oddsProvider === "rundown";
    const rd = fromRundown ? (oddsDebug as RundownDebugState) : null;
    const httpCode =
      "httpStatus" in oddsDebug && oddsDebug.httpStatus != null ? String(oddsDebug.httpStatus) : "";

    if (oddsDebug.status === "ok" && rd?.boardSource === "stale_cache") {
      return {
        label: "RUNDOWN RATE LIMITED — USING CACHED BOARD",
        tone: "text-amber-300 border-amber-700/50 bg-amber-950/30"
      };
    }
    if (oddsDebug.status === "ok" && rd?.boardSource === "odds_api_fallback") {
      return {
        label: "RUNDOWN UNAVAILABLE — ODDS API BACKUP",
        tone: "text-amber-300 border-amber-700/50 bg-amber-950/30"
      };
    }
    if (oddsDebug.status === "ok") {
      return {
        label: fromRundown ? "RUNDOWN FEED OK" : "LIVE ODDS OK",
        tone: "text-emerald-300 border-emerald-700/50 bg-emerald-950/30"
      };
    }
    if (oddsDebug.status === "missing_key") {
      return {
        label: fromRundown ? "NO RUNDOWN API KEY" : "NO ODDS API KEY",
        tone: "text-amber-300 border-amber-700/50 bg-amber-950/30"
      };
    }
    if (oddsDebug.status === "http_error") {
      return {
        label: `${fromRundown ? "RUNDOWN API" : "ODDS API"} ERROR ${httpCode}`.trim(),
        tone: "text-rose-300 border-rose-700/50 bg-rose-950/30"
      };
    }
    if (oddsDebug.status === "no_events")
      return {
        label: fromRundown ? "RUNDOWN RETURNED NO EVENTS" : "BOOK API EMPTY — NO LIVE LINES",
        tone: "text-amber-300 border-amber-700/50 bg-amber-950/30"
      };
    if (oddsDebug.status === "exception")
      return {
        label: fromRundown ? "RUNDOWN FETCH EXCEPTION" : "ODDS FETCH EXCEPTION",
        tone: "text-rose-300 border-rose-700/50 bg-rose-950/30"
      };
    return { label: "LINE FEED STATUS UNKNOWN", tone: "text-slate-300 border-slate-700/50 bg-slate-900/40" };
  }, [oddsDebug, data?.oddsProvider]);

  async function saveSlipToServer() {
    setSaveMsg("");
    const { bankroll, unitSize, bets: slipBets } = useBetStore.getState();
    if (!slipBets.length) {
      setSaveMsg("Add legs to the slip first.");
      return;
    }
    const name = window.prompt("Name this slip (optional)", "My slip");
    if (name === null) return;
    const res = await fetch("/api/saved-slips", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || null, bankroll, unitSize, bets: slipBets })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveMsg(data.error === "Unauthorized" ? "Log in to save slips (My library)." : data.error ?? "Save failed");
      return;
    }
    setSaveMsg("Saved — open My library in the header.");
  }

  async function runSimulation() {
    setRunning(true);
    const { bankroll, unitSize, bets: slipBets } = useBetStore.getState();
    const res = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bets: slipBets, bankroll, unitSize })
    });
    const payload = await res.json();
    sessionStorage.setItem("diamondedge_results", JSON.stringify(payload));
    setRunning(false);
    window.location.href = "/simulation-results";
  }

  return (
    <main className="grid gap-4 lg:grid-cols-[1fr_min(380px,100%)]">
      <section className="panel overflow-hidden p-4 lg:p-5">
        <div className="mb-4 flex flex-col gap-2 border-b border-slate-700/50 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-sky-300">Bet board</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">
              Player board defaults to per-player tabs; switch to stat columns if you prefer. With{" "}
              <code className="text-slate-300">ODDS_PROVIDER=rundown</code>, player props use The Rundown feed re-shaped into
              the same layout as The Odds API (hits, RBI, H+R+RBI, K, etc.) so the board matches book-style rows. When{" "}
              <code className="text-slate-300">ODDS_API_KEY</code> is set and the Odds API returns events, those prices
              override first; the client re-fetches about hourly. Simulation only — not a sportsbook.
            </p>
            {oddsBadge ? (
              <div className={`mt-2 inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] ${oddsBadge.tone}`}>
                <span className="font-semibold">{oddsBadge.label}</span>
                {"remaining" in (oddsDebug ?? {}) && typeof (oddsDebug as OddsDebugState).remaining === "string" ? (
                  <span>remaining: {(oddsDebug as OddsDebugState).remaining}</span>
                ) : null}
                {oddsDebug?.detail ? <span className="text-slate-300/90">· {oddsDebug.detail}</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="block min-w-[200px] text-sm text-slate-300">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Game</span>
            <select
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
              value={gameId}
              onChange={(e) => setGameId(e.target.value)}
            >
              {(data?.games ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.awayTeam} @ {g.homeTeam}
                </option>
              ))}
            </select>
          </label>
          <label className="block min-w-[180px] text-sm text-slate-300">
            <span className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">View</span>
            <select
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100"
              value={marketFilter}
              onChange={(e) =>
                setMarketFilter(e.target.value as "all" | "lines" | "players_tabs" | "players_columns")
              }
            >
              <option value="all">All</option>
              <option value="lines">Game lines only</option>
              <option value="players_tabs">Player props (tabs)</option>
              <option value="players_columns">Player props (stat columns)</option>
            </select>
          </label>
        </div>

        {(marketFilter === "all" || marketFilter === "lines") && (
          <div className="space-y-2">
            {usingModelGameLines ? (
              <p className="rounded-md border border-sky-800/60 bg-sky-950/30 px-2 py-1.5 text-[11px] text-sky-200/95">
                Live book game lines are not on the wire for this game right now. Showing simulated lines from the same
                engine as the rest of the app so you can still build slips — not sportsbook prices.
              </p>
            ) : null}
            <GameLinesRow markets={lineMarkets} onAdd={addBet} />
          </div>
        )}

        {(marketFilter === "all" || marketFilter === "players_tabs") && (
          <div className="-mx-1 px-1 pb-1">
            {playerMarkets.length ? (
              <PlayerTabsBoard markets={playerMarkets} onAdd={addBet} />
            ) : (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">{playerPropsEmptyHint}</div>
            )}
          </div>
        )}

        {marketFilter === "players_columns" && (
          <div className="thin-scrollbar -mx-1 max-w-[100vw] overflow-x-auto px-1 pb-1">
            {playerMarkets.length ? (
              <PlayerPropColumns markets={playerMarkets} onAdd={addBet} />
            ) : (
              <div className="rounded-lg border border-amber-700/50 bg-amber-950/20 p-3 text-sm text-amber-200">{playerPropsEmptyHint}</div>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <button disabled={!bets.length || running} className="btn-primary w-full sm:w-auto" onClick={runSimulation}>
            {running ? "Running 1,000 simulations…" : "Run 1,000 simulations"}
          </button>
          <button type="button" disabled={!bets.length} className="btn-muted w-full sm:w-auto" onClick={saveSlipToServer}>
            Save slip to account
          </button>
        </div>
        {saveMsg ? <p className="mt-2 text-xs text-slate-400">{saveMsg}</p> : null}
      </section>
      <BetSlip />
    </main>
  );
}
