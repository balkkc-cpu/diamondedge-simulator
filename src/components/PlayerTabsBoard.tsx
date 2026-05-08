"use client";

import { useMemo, useState } from "react";
import { isSportsbookLineSource } from "@/lib/odds";
import type { Market, SlipBet } from "@/lib/types";

function playerNameOf(m: Market): string {
  if (m.playerName) return m.playerName;
  const i = m.selection.indexOf(" · ");
  return i > 0 ? m.selection.slice(0, i).trim() : m.selection.slice(0, 28);
}

function groupByPlayer(list: Market[]) {
  const map = new Map<string, Market[]>();
  for (const m of list) {
    const p = playerNameOf(m);
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(m);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => a.selection.localeCompare(b.selection));
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function marketToSlip(m: Market): SlipBet {
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

export function PlayerTabsBoard({
  markets,
  onAdd
}: {
  markets: Market[];
  onAdd: (bet: SlipBet) => void;
}) {
  const groups = useMemo(() => groupByPlayer(markets), [markets]);
  const [tab, setTab] = useState(0);

  if (!groups.length) {
    return (
      <p className="text-sm text-slate-500">
        No sportsbook player props available for this game right now.
      </p>
    );
  }

  const safeIdx = Math.min(tab, groups.length - 1);
  const [name, ms] = groups[safeIdx];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-400/90">Player props · by player</p>
        <p className="text-[11px] text-slate-500">
          Lines refresh from a server cache (long when using The Odds API; shorter with The Rundown). This page re-fetches hourly.
        </p>
      </div>

      <div className="thin-scrollbar flex max-w-full gap-1 overflow-x-auto pb-1">
        {groups.map(([player], idx) => (
          <button
            key={player}
            type="button"
            onClick={() => setTab(idx)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              idx === safeIdx ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {player}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-950/50 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-200">{name}</p>
        <div className="flex max-h-[min(420px,55vh)] flex-wrap gap-2 overflow-y-auto pr-1">
          {ms.map((m) => {
            const tail = m.selection.includes(" · ") ? m.selection.split(" · ").slice(1).join(" · ") : m.selection;
            return (
              <button
                key={m.id}
                type="button"
                className="max-w-full rounded-lg border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-left text-[11px] text-slate-100 hover:border-sky-500/60"
                onClick={() => onAdd(marketToSlip(m))}
              >
                <span className="font-semibold text-sky-200/90">{m.american > 0 ? `+${m.american}` : m.american}</span>
                {isSportsbookLineSource(m.source) ? (
                  <span className="ml-1.5 rounded bg-emerald-900/50 px-1 text-[9px] font-bold uppercase text-emerald-300">
                    live
                  </span>
                ) : null}
                <div className="mt-0.5 text-slate-300">{tail}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
