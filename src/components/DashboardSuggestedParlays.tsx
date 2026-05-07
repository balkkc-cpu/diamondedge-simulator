"use client";

import { useEffect, useMemo, useState } from "react";
import type { SuggestedParlayCard } from "@/lib/suggestedParlays";

type ParlayLegs = 2 | 3 | 4;

function pct(n: number, d = 2) {
  return `${(Number(n) * 100).toFixed(d)}%`;
}

export function DashboardSuggestedParlays(props: { parlays: SuggestedParlayCard[]; initialLegs?: ParlayLegs }) {
  const initialLegs = props.initialLegs ?? 3;
  const [legs, setLegs] = useState<ParlayLegs>(initialLegs);
  const [parlays, setParlays] = useState<SuggestedParlayCard[]>(props.parlays ?? []);
  const [loading, setLoading] = useState(false);

  const base = useMemo(() => {
    return `${legs}`;
  }, [legs]);

  useEffect(() => {
    setParlays(props.parlays ?? []);
  }, [props.parlays]);

  async function refresh(nextLegs: ParlayLegs) {
    setLegs(nextLegs);
    setLoading(true);
    try {
      const res = await fetch(`/api/suggested-parlays?legs=${nextLegs}`, { method: "GET" });
      const data = await res.json();
      setParlays((data?.parlays ?? []) as SuggestedParlayCard[]);
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="panel flex flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-100">Suggested parlays</h3>
          <p className="text-[11px] text-slate-500">Sim-built from today’s player-prop board.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Legs:</span>
          <button
            type="button"
            className={legs === 2 ? "btn-muted bg-slate-800/70" : "btn-muted"}
            onClick={() => refresh(2)}
          >
            2
          </button>
          <button
            type="button"
            className={legs === 3 ? "btn-muted bg-slate-800/70" : "btn-muted"}
            onClick={() => refresh(3)}
          >
            3
          </button>
          <button
            type="button"
            className={legs === 4 ? "btn-muted bg-slate-800/70" : "btn-muted"}
            onClick={() => refresh(4)}
          >
            4
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Building parlays…</p>
      ) : !parlays.length ? (
        <p className="text-sm text-slate-400">No player props available to build parlays yet.</p>
      ) : (
        <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
          {parlays.map((p) => (
            <article key={p.title} className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-slate-100">{p.title}</p>
                <p className="text-xs text-slate-300">
                  Est. hit: <span className="font-semibold text-slate-100">{pct(p.parlayHitProbability)}</span>
                </p>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{p.simContext.runEnvironmentNote}</p>

              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-300">
                {p.legs.length ? (
                  p.legs.map((leg) => (
                    <li key={leg.betId}>
                      {leg.selection} <span className="text-slate-500">({pct(leg.hitProbability, 1)})</span>
                      <div className="mt-1 space-y-1 pl-4 text-[11px] text-slate-400">
                        {leg.whyItCouldHit.slice(0, 1).map((x, i) => (
                          <p key={`h-${leg.betId}-${i}`}>Why: {x}</p>
                        ))}
                        {leg.whyItCouldMiss.slice(0, 1).map((x, i) => (
                          <p key={`m-${leg.betId}-${i}`}>Watch: {x}</p>
                        ))}
                      </div>
                    </li>
                  ))
                ) : (
                  <li className="list-none text-slate-500">No matching legs found on today’s board.</li>
                )}
              </ul>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

