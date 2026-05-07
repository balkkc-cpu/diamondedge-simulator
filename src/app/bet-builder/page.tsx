"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BetSlip } from "@/components/BetSlip";
import { GameLinesRow, PlayerPropColumns } from "@/components/PlayerPropColumns";
import { PlayerTabsBoard } from "@/components/PlayerTabsBoard";
import { useBetStore } from "@/store/betStore";
import { GameCard, Market, SlipBet } from "@/lib/types";

function isPlayerMarket(m: Market) {
  return m.marketType.startsWith("player_");
}

function gameFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("game");
}

export default function BetBuilderPage() {
  const urlGameRef = useRef<string | null>(null);
  if (urlGameRef.current === null && typeof window !== "undefined") {
    urlGameRef.current = gameFromUrl();
  }

  const [data, setData] = useState<{ games: GameCard[]; allMarkets: Market[] } | null>(null);
  const [gameId, setGameId] = useState<string>("mock-game-001");
  const [marketFilter, setMarketFilter] = useState<"all" | "lines" | "players_tabs" | "players_columns">("players_tabs");
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
    const t = window.setInterval(loadDashboard, 600_000);
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
  const lineMarkets = useMemo(() => forGame.filter((m) => !isPlayerMarket(m)), [forGame]);
  const playerMarkets = useMemo(() => forGame.filter((m) => isPlayerMarket(m)), [forGame]);

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
              Player board defaults to per-player tabs; switch to stat columns if you prefer. Board prices merge FanDuel
              (The Odds API) when <code className="text-slate-300">ODDS_API_KEY</code> is set — client refetch every 10
              minutes. Simulation only — not a sportsbook.
            </p>
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
          <GameLinesRow markets={lineMarkets} onAdd={addBet} />
        )}

        {(marketFilter === "all" || marketFilter === "players_tabs") && (
          <div className="-mx-1 px-1 pb-1">
            <PlayerTabsBoard markets={playerMarkets} onAdd={addBet} />
          </div>
        )}

        {marketFilter === "players_columns" && (
          <div className="thin-scrollbar -mx-1 max-w-[100vw] overflow-x-auto px-1 pb-1">
            <PlayerPropColumns markets={playerMarkets} onAdd={addBet} />
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
