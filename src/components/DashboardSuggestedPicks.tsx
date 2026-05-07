import Link from "next/link";
import type { DailyPickRow } from "@/lib/dailyPicks";

export function DashboardSuggestedPicks({ picks }: { picks: DailyPickRow[] }) {
  return (
    <div className="panel flex h-full min-h-[320px] flex-col p-4 lg:min-h-0">
      <div className="mb-3 shrink-0 border-b border-slate-700/50 pb-3">
        <h3 className="text-lg font-bold tracking-tight text-sky-300">Suggested bets today</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Pre-scanned from the merged board and run through the same 800-run sim as the rest of the app. Ranked by sim edge
          vs breakeven; copy is for research only — not betting advice.
        </p>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
        {picks.length === 0 ? (
          <p className="text-slate-500">No picks for this slate yet (empty schedule or markets).</p>
        ) : (
          picks.map((p) => (
            <article key={p.betId} className="rounded-xl border border-slate-700/70 bg-slate-950/80 p-3 shadow-inner shadow-black/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded bg-sky-900/50 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-200">
                  Pick #{p.rank}
                </span>
                <span className="text-[10px] text-slate-500">Game {p.gameId}</span>
              </div>
              <p className="mt-2 font-semibold leading-snug text-slate-100">{p.selection}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {p.marketType} · {p.oddsAmerican > 0 ? `+${p.oddsAmerican}` : p.oddsAmerican} · Sim{" "}
                {(p.hitProbability * 100).toFixed(1)}% · Edge {(p.edge * 100).toFixed(1)} pts · {p.suggestedUnits}u tag
              </p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{p.whySuggested}</p>
              {p.suggestedUnitsNote ? <p className="mt-1 text-[11px] text-slate-500">{p.suggestedUnitsNote}</p> : null}
              <details className="mt-2 text-[11px] text-slate-400">
                <summary className="cursor-pointer font-medium text-sky-400/90">Why it could hit / miss</summary>
                <ul className="mt-2 space-y-1.5 pl-1">
                  {p.leg.whyItCouldHit.map((x, i) => (
                    <li key={`h-${i}`} className="border-l-2 border-emerald-600/50 pl-2">
                      <span className="text-emerald-400/90">Hit angle: </span>
                      {x}
                    </li>
                  ))}
                  {p.leg.whyItCouldMiss.map((x, i) => (
                    <li key={`m-${i}`} className="border-l-2 border-amber-600/50 pl-2">
                      <span className="text-amber-400/90">Miss risk: </span>
                      {x}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))
        )}
      </div>

      <div className="mt-4 shrink-0 border-t border-slate-700/50 pt-3">
        <Link className="btn-primary inline-block w-full text-center" href="/bet-builder">
          Open Bet Builder
        </Link>
      </div>
    </div>
  );
}
