"use client";

import { Market } from "@/lib/types";
import { SlipBet } from "@/lib/types";

const STAT_ORDER = ["hits", "runs", "rbi", "tb", "hrr", "hr", "walks", "k"] as const;

const STAT_HEADINGS: Record<string, string> = {
  hits: "Hits",
  runs: "Runs",
  rbi: "RBI",
  tb: "Total bases",
  hrr: "H + R + RBI",
  hr: "Home runs",
  walks: "Walks",
  k: "Strikeouts"
};

function statKeyOf(m: Market): string {
  return m.statKey ?? m.marketType.replace(/^player_/, "") ?? "other";
}

function playerNameOf(m: Market): string {
  if (m.playerName) return m.playerName;
  const i = m.selection.indexOf(" · ");
  return i > 0 ? m.selection.slice(0, i).trim() : m.selection.slice(0, 24);
}

function chipLabel(m: Market): string {
  const i = m.selection.indexOf(" · ");
  const tail = i > 0 ? m.selection.slice(i + 2).trim() : m.selection;
  return tail
    .replace(/Total bases/gi, "TB")
    .replace(/Runs \+ hits \+ RBI/gi, "H+R+RBI")
    .replace(/Home run/gi, "HR")
    .replace(/Strikeouts/gi, "K")
    .replace(/Walks/gi, "BB");
}

function groupByPlayer(list: Market[]) {
  const map = new Map<string, Market[]>();
  for (const m of list) {
    const p = playerNameOf(m);
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(m);
  }
  for (const arr of map.values()) {
    arr.sort((a, b) => {
      const pa = `${a.pickKind ?? ""}-${a.line ?? ""}-${a.selection}`;
      const pb = `${b.pickKind ?? ""}-${b.line ?? ""}-${b.selection}`;
      return pa.localeCompare(pb);
    });
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function PlayerPropColumns({
  markets,
  onAdd
}: {
  markets: Market[];
  onAdd: (bet: SlipBet) => void;
}) {
  const byStat = new Map<string, Market[]>();
  for (const m of markets) {
    const sk = statKeyOf(m);
    if (!byStat.has(sk)) byStat.set(sk, []);
    byStat.get(sk)!.push(m);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-950/50 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-sky-400/90">Player props</p>
        <p className="text-[11px] text-slate-500">Same menu for every player · scroll columns · tap to add</p>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        {STAT_ORDER.map((stat) => {
          const list = byStat.get(stat) ?? [];
          if (!list.length) return null;
          const rows = groupByPlayer(list);
          return (
            <div
              key={stat}
              className="flex max-h-[min(78vh,900px)] flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-gradient-to-b from-slate-900/95 to-slate-950 shadow-lg shadow-black/30"
            >
              <div className="shrink-0 border-b border-slate-700/80 bg-slate-900/90 px-3 py-2 text-center">
                <div className="text-[11px] font-bold uppercase tracking-widest text-sky-300/90">{STAT_HEADINGS[stat] ?? stat}</div>
              </div>
              <div className="thin-scrollbar flex-1 space-y-2 overflow-y-auto p-2">
                {rows.map(([player, picks]) => (
                  <div key={player} className="rounded-lg border border-slate-700/40 bg-slate-900/60 p-2">
                    <div className="truncate text-[11px] font-bold text-slate-200" title={player}>
                      {player}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {picks.map((m) => (
          <button
            key={m.id}
            type="button"
            title={m.selection}
            onClick={() =>
              onAdd({
                id: m.id,
                gameId: m.gameId,
                              marketType: m.marketType,
                              selection: m.selection,
                              line: m.line,
                              oddsAmerican: m.american,
                              playerName: m.playerName,
                              statKey: m.statKey,
                              pickKind: m.pickKind,
                              tierMin: m.tierMin ?? undefined
                            })
                          }
                          className="rounded-md border border-slate-600/80 bg-slate-950/80 px-1.5 py-1 text-left text-[10px] font-semibold leading-tight text-slate-100 transition hover:border-sky-500/60 hover:bg-slate-800"
                        >
                          <span className="block text-slate-300">{chipLabel(m)}</span>
                          <span className={m.american >= 0 ? "text-emerald-400" : "text-rose-300"}>
                            {m.american > 0 ? `+${m.american}` : m.american}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GameLinesRow({
  markets,
  onAdd
}: {
  markets: Market[];
  onAdd: (bet: SlipBet) => void;
}) {
  if (!markets.length) return null;
  return (
    <div className="mb-4 rounded-xl border border-slate-700/60 bg-slate-950/40 p-3">
      <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-indigo-300/90">Game markets</div>
      <div className="flex flex-wrap gap-2">
        {markets.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() =>
              onAdd({
                id: m.id,
                gameId: m.gameId,
                marketType: m.marketType,
                selection: m.selection,
                line: m.line,
                oddsAmerican: m.american
              })
            }
            className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-left text-xs font-medium text-slate-100 hover:border-indigo-500/50"
          >
            <span className="block text-slate-400">
              {m.marketType}
              {m.source === "fanduel" ? (
                <span className="ml-1 rounded bg-emerald-900/40 px-1 text-[9px] font-bold uppercase text-emerald-300">board</span>
              ) : null}
            </span>
            <span className="block">{m.selection}</span>
            <span className={m.american >= 0 ? "text-emerald-400" : "text-rose-300"}>
              {m.american > 0 ? `+${m.american}` : m.american}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
