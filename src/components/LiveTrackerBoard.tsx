"use client";

import { LiveGamePayload } from "@/lib/liveGame";
import { useEffect, useState } from "react";

function BasesDiamond({ first, second, third }: { first: boolean; second: boolean; third: boolean }) {
  return (
    <div className="relative mx-auto h-36 w-36">
      <div className="absolute inset-0 rotate-45 rounded-lg border-2 border-slate-600/80 bg-slate-900/60" />
      <div
        className={
          "absolute left-1/2 top-3 h-7 w-7 -translate-x-1/2 rounded border-2 " +
          (second ? "border-emerald-400 bg-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.5)]" : "border-slate-600 bg-slate-800/50")
        }
        title="2nd"
      />
      <div
        className={
          "absolute bottom-8 left-3 h-7 w-7 rounded border-2 " +
          (third ? "border-emerald-400 bg-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.5)]" : "border-slate-600 bg-slate-800/50")
        }
        title="3rd"
      />
      <div
        className={
          "absolute bottom-8 right-3 h-7 w-7 rounded border-2 " +
          (first ? "border-emerald-400 bg-emerald-500/40 shadow-[0_0_12px_rgba(52,211,153,0.5)]" : "border-slate-600 bg-slate-800/50")
        }
        title="1st"
      />
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] text-slate-500">Bases</div>
    </div>
  );
}

export function LiveTrackerBoard({ gamePk, gameLabel }: { gamePk: string; gameLabel: string }) {
  const [live, setLive] = useState<LiveGamePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/live-game?gamePk=${encodeURIComponent(gamePk)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Load failed");
        if (!cancelled) {
          setLive(data);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    };
    tick();
    const id = setInterval(tick, 12000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gamePk]);

  if (err || !live) {
    return (
      <div className="panel p-6 text-center text-sm text-slate-400">
        {err ? `Could not load live board: ${err}` : "Loading live game board…"}
        <p className="mt-2 text-xs text-slate-500">
          Game: {gameLabel} (#{gamePk}) · If the slate is preview-only, try another game or check back after first pitch.
        </p>
      </div>
    );
  }

  const awayInns = live.inningScoresAway.length ? live.inningScoresAway : [{ inning: 1, runs: undefined }];
  const homeInns = live.inningScoresHome.length ? live.inningScoresHome : [{ inning: 1, runs: undefined }];

  const inningLabel =
    live.inningHalf === "top"
      ? `Top ${live.inning}`
      : live.inningHalf === "bottom"
        ? `Bottom ${live.inning}`
        : live.inningState || `Inning ${live.inning}`;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/80 bg-gradient-to-b from-slate-900 via-[#0c1220] to-slate-950 shadow-2xl shadow-black/40">
      <div className="border-b border-slate-700/60 bg-slate-900/80 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
        Live game tracker — simulation estimates only
      </div>

      <div className="border-b border-slate-700/50 bg-slate-950/60 px-4 py-4">
        <div className="mx-auto max-w-3xl">
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-sky-500/90">At the plate</p>
          <p className="mt-1 text-center text-lg font-bold text-white">
            {live.atBatPitcher && live.atBatBatter ? (
              <>
                <span className="text-sky-300">{live.atBatPitcher}</span>
                <span className="mx-2 text-slate-500">vs</span>
                <span className="text-indigo-200">{live.atBatBatter}</span>
              </>
            ) : (
              <span className="text-base font-normal text-slate-400">Pitcher vs batter appears here once the game is live (MLB feed).</span>
            )}
          </p>
          {(live.onDeck || live.inHole) && (
            <p className="mt-2 text-center text-xs text-slate-500">
              {live.onDeck ? (
                <>
                  On deck: <span className="text-slate-300">{live.onDeck}</span>
                </>
              ) : null}
              {live.onDeck && live.inHole ? " · " : ""}
              {live.inHole ? (
                <>
                  In the hole: <span className="text-slate-300">{live.inHole}</span>
                </>
              ) : null}
            </p>
          )}
          <div className="mt-3 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-center text-sm leading-snug text-slate-200">
            <span className="text-[10px] font-semibold uppercase text-slate-500">Last play · </span>
            {live.lastPlayText ?? "No play description yet (pregame or feed loading)."}
          </div>
        </div>
      </div>

      <div className="grid gap-0 md:grid-cols-[1fr_auto_1fr]">
        <div className="flex flex-col items-center justify-center border-b border-slate-700/50 px-4 py-6 md:border-b-0 md:border-r">
          <span className="text-2xl font-black text-slate-100">{live.awayAbbr ?? "AWY"}</span>
          <span className="mt-1 max-w-[10rem] truncate text-center text-xs text-slate-400">{live.awayTeam}</span>
          <span className="mt-3 text-5xl font-black tabular-nums text-white">{live.awayScore}</span>
        </div>

        <div className="flex min-w-[200px] flex-col items-center justify-center border-b border-slate-700/50 px-4 py-5 md:border-b-0 md:border-x md:border-slate-700/50">
          <div className="text-sm font-bold uppercase text-sky-300">{inningLabel}</div>
          <div className="mt-1 text-3xl font-black tabular-nums text-white">{live.outs} <span className="text-lg font-semibold text-slate-400">out</span></div>
          <div className="mt-2 flex gap-3 text-sm">
            <span className="rounded-md bg-slate-800 px-2 py-1 text-amber-300">{live.balls}-{live.strikes}</span>
            <span className="text-slate-500">count</span>
          </div>
          <div className="mt-4 w-full max-w-[220px] space-y-1">
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Away win</span>
              <span>{(live.winProbAway * 100).toFixed(1)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500" style={{ width: `${live.winProbAway * 100}%` }} />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>Home win</span>
              <span>{(live.winProbHome * 100).toFixed(1)}%</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center px-4 py-6">
          <span className="text-2xl font-black text-slate-100">{live.homeAbbr ?? "HME"}</span>
          <span className="mt-1 max-w-[10rem] truncate text-center text-xs text-slate-400">{live.homeTeam}</span>
          <span className="mt-3 text-5xl font-black tabular-nums text-white">{live.homeScore}</span>
        </div>
      </div>

      <div className="grid gap-4 border-t border-slate-700/50 px-4 py-6 md:grid-cols-2">
        <BasesDiamond first={live.firstOccupied} second={live.secondOccupied} third={live.thirdOccupied} />
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-300">Linescore (R per inning)</h4>
          <div className="overflow-x-auto text-xs">
            <table className="w-full border-collapse text-center">
              <thead>
                <tr className="border-b border-slate-700 text-slate-500">
                  <th className="p-1 text-left">Team</th>
                  {awayInns.map((_, i) => (
                    <th key={i} className="p-1">
                      {i + 1}
                    </th>
                  ))}
                  <th className="p-1 text-sky-300">R</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800">
                  <td className="p-1 text-left font-medium">{live.awayAbbr ?? "AWY"}</td>
                  {awayInns.map((inn, idx) => (
                    <td key={idx} className="p-1 tabular-nums">
                      {inn.runs ?? "—"}
                    </td>
                  ))}
                  <td className="p-1 font-bold text-white">{live.awayScore}</td>
                </tr>
                <tr>
                  <td className="p-1 text-left font-medium">{live.homeAbbr ?? "HME"}</td>
                  {homeInns.map((inn, idx) => (
                    <td key={idx} className="p-1 tabular-nums">
                      {inn.runs ?? "—"}
                    </td>
                  ))}
                  <td className="p-1 font-bold text-white">{live.homeScore}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">Status: {live.detailedState || live.status}</p>
        </div>
      </div>

      <div className="border-t border-slate-700/60 bg-slate-900/40 px-4 py-2 text-center text-[10px] text-slate-500">
        Auto-refresh ~12s · Data: MLB Stats API · Not affiliated with any sportsbook
      </div>
    </div>
  );
}

export function GamePkSelect({
  games,
  value,
  onChange
}: {
  games: Array<{ id: string; awayTeam: string; homeTeam: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="block text-sm text-slate-300">
      <span className="mr-2 font-semibold text-slate-400">Game</span>
      <select
        className="mt-1 w-full max-w-xl rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {games.map((g) => (
          <option key={g.id} value={g.id}>
            {g.awayTeam} @ {g.homeTeam} (#{g.id})
          </option>
        ))}
      </select>
    </label>
  );
}
