"use client";

import { formatNbaMinutes, type NbaLiveGamePayload, type NbaPlayerLiveRow } from "@/lib/nbaLiveGame";
import { useEffect, useRef, useState } from "react";
import { NbaCourtShotChart } from "./NbaCourtShotChart";

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function PlayerTable({ title, rows, accent }: { title: string; rows: NbaPlayerLiveRow[]; accent: "sky" | "violet" }) {
  const head = accent === "sky" ? "text-sky-300" : "text-violet-300";
  const on = accent === "sky" ? "bg-sky-500/20 text-sky-200" : "bg-violet-500/20 text-violet-200";
  return (
    <div className="rounded-lg border border-slate-700/80 bg-slate-950/50">
      <h4 className={`border-b border-slate-700/60 px-2 py-1.5 text-xs font-bold uppercase tracking-wide ${head}`}>{title}</h4>
      <div className="thin-scrollbar max-h-64 overflow-y-auto text-[11px]">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 bg-slate-950/95 text-[9px] uppercase text-slate-500">
            <tr>
              <th className="p-1 pl-2">Player</th>
              <th className="p-1 text-right">MIN</th>
              <th className="p-1 text-right">PTS</th>
              <th className="p-1 text-right">REB</th>
              <th className="p-1 text-right">AST</th>
              <th className="p-1 text-right">FG</th>
              <th className="p-1 text-right">3P</th>
              <th className="p-1 pr-2 text-right">+/-</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 14).map((p) => (
              <tr key={p.personId} className="border-t border-slate-800/80 text-slate-300">
                <td className="p-1 pl-2 font-medium text-slate-200">
                  <span className={p.oncourt ? on : ""}>{p.nameI}</span>
                  {p.jerseyNum ? <span className="ml-1 text-slate-500">#{p.jerseyNum}</span> : null}
                </td>
                <td className="p-1 text-right tabular-nums text-slate-400">{p.minutes ? formatNbaMinutes(p.minutes) : "—"}</td>
                <td className="p-1 text-right tabular-nums font-semibold text-white">{p.points}</td>
                <td className="p-1 text-right tabular-nums">{p.rebounds}</td>
                <td className="p-1 text-right tabular-nums">{p.assists}</td>
                <td className="p-1 text-right tabular-nums text-slate-400">
                  {p.fgm}-{p.fga}
                </td>
                <td className="p-1 text-right tabular-nums text-slate-400">
                  {p.threePm}-{p.threePa}
                </td>
                <td className="p-1 pr-2 text-right tabular-nums text-slate-400">
                  {p.plusMinus != null ? (p.plusMinus > 0 ? `+${p.plusMinus}` : `${p.plusMinus}`) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function NbaLiveTrackerBoard({ gameId, gameLabel }: { gameId: string; gameLabel: string }) {
  const [live, setLive] = useState<NbaLiveGamePayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pulseAction, setPulseAction] = useState<number | null>(null);
  const lastShotRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/nba-live-game?gameId=${encodeURIComponent(gameId)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Load failed");
        if (!cancelled) {
          const next = data as NbaLiveGamePayload;
          const shots = next.shots ?? [];
          const last = shots.length ? shots[shots.length - 1]!.actionNumber : null;
          if (last != null && last !== lastShotRef.current) {
            lastShotRef.current = last;
            setPulseAction(last);
            window.setTimeout(() => setPulseAction((x) => (x === last ? null : x)), 2800);
          }
          setLive(next);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [gameId]);

  if (err || !live) {
    return (
      <div className="panel p-6 text-center text-sm text-slate-400">
        {err ? `Could not load NBA tracker: ${err}` : "Loading NBA live board…"}
        <p className="mt-2 text-xs text-slate-500">
          {gameLabel} · Game id <code className="text-slate-300">{gameId}</code> · Pick a game from today&apos;s NBA scoreboard.
        </p>
      </div>
    );
  }

  const recentRebounds = live.rebounds.slice(-8).reverse();
  const recentAssists = live.assists.slice(-8).reverse();

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-900/40 bg-gradient-to-b from-slate-950 via-[#0c1018] to-slate-950 shadow-2xl shadow-black/50">
      <div className="border-b border-amber-800/30 bg-slate-900/90 px-4 py-2 text-center text-xs font-semibold uppercase tracking-wider text-amber-200/90">
        NBA live tracker · shot chart + box score · Simulation app — not a sportsbook
      </div>

      <div className="border-b border-slate-800/80 px-4 py-4">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400/90">Game clock</p>
          <p className="text-2xl font-black tabular-nums text-white md:text-3xl">{live.gameClockDisplay}</p>
          <p className="text-sm text-amber-200/80">{live.gameStatusText}</p>
          <p className="text-[10px] text-slate-500">
            Feed updated <span className="text-slate-400">{fmtTime(live.fetchedAt)}</span> · auto-refresh ~5s
          </p>
        </div>
      </div>

      <div className="grid gap-0 border-b border-slate-800/80 md:grid-cols-3">
        <div className="flex flex-col items-center border-b border-slate-800/80 px-4 py-5 md:border-b-0 md:border-r">
          <span className="text-xl font-black text-slate-100">{live.awayTricode ?? "AWY"}</span>
          <span className="mt-1 max-w-[12rem] truncate text-center text-xs text-slate-400">{live.awayTeam}</span>
          <span className="mt-3 text-5xl font-black tabular-nums text-white">{live.awayScore}</span>
        </div>
        <div className="flex flex-col items-center justify-center border-b border-slate-800/80 px-4 py-4 md:border-b-0 md:border-x">
          <NbaCourtShotChart shots={live.shots} highlightActionNumber={pulseAction} />
        </div>
        <div className="flex flex-col items-center px-4 py-5">
          <span className="text-xl font-black text-slate-100">{live.homeTricode ?? "HME"}</span>
          <span className="mt-1 max-w-[12rem] truncate text-center text-xs text-slate-400">{live.homeTeam}</span>
          <span className="mt-3 text-5xl font-black tabular-nums text-white">{live.homeScore}</span>
        </div>
      </div>

      <div className="border-b border-slate-800/80 px-4 py-4">
        <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-200/90">Recent shots (type + player)</h4>
        <ul className="flex flex-wrap gap-2 text-[10px] text-slate-300">
          {live.shots
            .slice(-10)
            .reverse()
            .map((s) => (
              <li
                key={s.actionNumber}
                className={`rounded-full border px-2 py-1 ${
                  s.made ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-100" : "border-rose-800/50 bg-rose-950/30 text-rose-100"
                }`}
              >
                <span className="font-semibold">{s.playerNameI ?? "?"}</span>
                <span className="text-slate-400"> · </span>
                <span className="uppercase">{s.actionType}</span>
                {s.subType ? <span> {s.subType}</span> : null}
                {s.descriptor ? <span className="italic text-slate-400"> ({s.descriptor})</span> : null}
                {s.shotDistanceFt != null ? <span className="text-slate-500"> · {s.shotDistanceFt.toFixed(1)} ft</span> : null}
              </li>
            ))}
        </ul>
      </div>

      <div className="grid gap-4 border-b border-slate-800/80 px-4 py-5 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-sky-300">Rebounds (latest)</h4>
          <ul className="space-y-1.5 text-[11px] text-slate-300">
            {recentRebounds.length ? (
              recentRebounds.map((r) => (
                <li
                  key={r.actionNumber}
                  className="flex flex-wrap items-baseline gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5"
                >
                  <span className="font-mono text-[10px] text-slate-500">
                    Q{r.period} {formatNbaMinutes(r.clock)}
                  </span>
                  <span className="font-semibold text-amber-200/90">{r.teamTricode}</span>
                  <span>{r.playerNameI ?? "Team"}</span>
                  <span className="text-slate-500">{r.subType === "offensive" ? "OREB" : r.subType === "defensive" ? "DREB" : "REB"}</span>
                </li>
              ))
            ) : (
              <li className="text-slate-500">No rebound rows yet (pregame).</li>
            )}
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-emerald-300">Assists (from made FGs)</h4>
          <ul className="space-y-1.5 text-[11px] text-slate-300">
            {recentAssists.length ? (
              recentAssists.map((a) => (
                <li key={a.actionNumber} className="rounded-md border border-slate-800/80 bg-slate-900/60 px-2 py-1.5">
                  {a.text}
                </li>
              ))
            ) : (
              <li className="text-slate-500">No assist-linked makes parsed yet.</li>
            )}
          </ul>
        </div>
      </div>

      {live.lastPlayDescription ? (
        <div className="border-b border-slate-800/80 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase text-slate-500">Last play</p>
          <p className="text-sm text-slate-200">{live.lastPlayDescription}</p>
        </div>
      ) : null}

      <div className="grid gap-4 px-4 py-5 md:grid-cols-2">
        <PlayerTable title={`${live.awayTricode ?? "Away"} · live box`} rows={live.awayPlayers} accent="sky" />
        <PlayerTable title={`${live.homeTricode ?? "Home"} · live box`} rows={live.homePlayers} accent="violet" />
      </div>

      <div className="border-t border-slate-800/60 bg-slate-900/50 px-4 py-2 text-center text-[10px] text-slate-500">
        Shots: type (2pt / 3pt / hook / layup in feed) + distance · On-court players highlighted · Data: NBA.com CDN
      </div>
    </div>
  );
}
