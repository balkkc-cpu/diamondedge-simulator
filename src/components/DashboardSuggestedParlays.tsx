"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { SuggestedParlayCard } from "@/lib/suggestedParlays";

type ParlayLegs = 2 | 3 | 4;

function pct(n: number, d = 2) {
  return `${(Number(n) * 100).toFixed(d)}%`;
}

function clampPct01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function ParlayMeters(props: { qualityLabel: string; quality01: number; probability01: number }) {
  const { qualityLabel, quality01, probability01 } = props;
  const [qW, setQW] = useState(0);
  const [pW, setPW] = useState(0);

  useLayoutEffect(() => {
    const a = requestAnimationFrame(() => {
      setQW(clampPct01(quality01) * 100);
      setPW(clampPct01(probability01) * 100);
    });
    return () => cancelAnimationFrame(a);
  }, [quality01, probability01]);

  return (
    <div className="mt-3 space-y-2.5">
      <div>
        <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-500">
          <span>{qualityLabel}</span>
          <span className="font-mono tabular-nums text-slate-300">{pct(quality01, 0)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-slate-700/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-700/90 via-amber-500 to-lime-400 transition-[width] duration-[1100ms] ease-out"
            style={{ width: `${qW}%` }}
          />
        </div>
      </div>
      <div>
        <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[10px] uppercase tracking-wide text-slate-500">
          <span>Parlay hit probability</span>
          <span className="font-mono tabular-nums text-slate-300">{pct(probability01, 2)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800/90 ring-1 ring-slate-700/40">
          <div
            className="h-full rounded-full bg-gradient-to-r from-slate-600 via-sky-600 to-sky-400 transition-[width] duration-[1100ms] ease-out [transition-delay:80ms]"
            style={{ width: `${pW}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function inferQuality01(p: SuggestedParlayCard): number {
  if (typeof p.parlayQualityScore01 === "number" && Number.isFinite(p.parlayQualityScore01)) {
    return clampPct01(p.parlayQualityScore01);
  }
  const legs = p.legs;
  if (!legs.length) return 0;
  const meanEdge = legs.reduce((s, l) => s + l.edge, 0) / legs.length;
  const meanHit = legs.reduce((s, l) => s + l.hitProbability, 0) / legs.length;
  const edge01 = clampPct01((meanEdge + 0.02) / 0.22);
  const hit01 = clampPct01(meanHit);
  return clampPct01(0.45 * hit01 + 0.55 * edge01);
}

function distinctGames(p: SuggestedParlayCard): number {
  if (typeof p.distinctGameCount === "number") return p.distinctGameCount;
  return new Set(p.legs.map((l) => l.gameId)).size;
}

function fmtEdgeSigned(edge: number) {
  const v = (edge * 100).toFixed(1);
  return edge >= 0 ? `+${v}%` : `${v}%`;
}

export function DashboardSuggestedParlays(props: { parlays: SuggestedParlayCard[]; initialLegs?: ParlayLegs }) {
  const initialLegs = props.initialLegs ?? 3;
  const [legs, setLegs] = useState<ParlayLegs>(initialLegs);
  const [parlays, setParlays] = useState<SuggestedParlayCard[]>(props.parlays ?? []);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setParlays(props.parlays ?? []);
  }, [props.parlays]);

  async function refresh(nextLegs: ParlayLegs) {
    setLegs(nextLegs);
    setLoading(true);
    try {
      const res = await fetch(`/api/suggested-parlays?legs=${nextLegs}&_=${Date.now()}`, {
        method: "GET",
        cache: "no-store"
      });
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
          <p className="text-[11px] text-slate-500">
            Sim-built from today’s board — legs spread across games when the slate allows.
          </p>
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
          <button type="button" className="btn-muted" onClick={() => refresh(legs)} disabled={loading} title="Draw a new random mix">
            New mix
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Building parlays…</p>
      ) : !parlays.length ? (
        <p className="text-sm text-slate-400">No player props available to build parlays yet.</p>
      ) : (
        <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm">
          {parlays.map((p) => {
            const dg = distinctGames(p);
            const q01 = inferQuality01(p);
            return (
              <article key={p.title} className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold text-slate-100">{p.title}</p>
                  <p className="text-[11px] text-slate-400">
                    <span className="text-slate-500">Games in slip:</span>{" "}
                    <span className="font-semibold text-slate-200">{dg}</span>
                  </p>
                </div>

                <ParlayMeters
                  qualityLabel="Model quality (edge + leg strength)"
                  quality01={q01}
                  probability01={p.parlayHitProbability}
                />

                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{p.simContext.runEnvironmentNote}</p>

                <div className="mt-3 border-t border-slate-800/80 pt-2">
                  <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">Leg breakdown</p>
                  <ul className="space-y-3 text-xs text-slate-300">
                    {p.legs.length ? (
                      p.legs.map((leg, idx) => (
                        <li key={leg.betId} className="list-none rounded-md border border-slate-800/60 bg-slate-900/40 p-2.5">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-sky-500/90">
                              Leg {idx + 1}
                            </span>
                            <span className="text-[11px] text-slate-400">{leg.matchup ?? "Matchup"}</span>
                          </div>
                          <p className="mt-1 font-medium text-slate-100">{leg.selection}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">{leg.marketType.replace(/_/g, " ")}</p>
                          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[10px] text-slate-400 sm:grid-cols-4">
                            <div>
                              <span className="block text-slate-500">Model hit</span>
                              <span className="text-slate-200">{pct(leg.hitProbability, 1)}</span>
                            </div>
                            <div>
                              <span className="block text-slate-500">Implied (price)</span>
                              <span className="text-slate-200">{pct(leg.impliedProbability, 1)}</span>
                            </div>
                            <div>
                              <span className="block text-slate-500">Edge</span>
                              <span className={leg.edge >= 0 ? "text-emerald-400" : "text-rose-400"}>{fmtEdgeSigned(leg.edge)}</span>
                            </div>
                            <div>
                              <span className="block text-slate-500">EV / $1</span>
                              <span className={leg.expectedValue >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                {leg.expectedValue >= 0 ? "+" : ""}
                                {leg.expectedValue.toFixed(2)}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 space-y-1 border-t border-slate-800/60 pt-2 text-[11px] text-slate-400">
                            {leg.whyItCouldHit.slice(0, 1).map((x, i) => (
                              <p key={`h-${leg.betId}-${i}`}>
                                <span className="text-slate-500">Why it could hit:</span> {x}
                              </p>
                            ))}
                            {leg.whyItCouldMiss.slice(0, 1).map((x, i) => (
                              <p key={`m-${leg.betId}-${i}`}>
                                <span className="text-slate-500">Risk:</span> {x}
                              </p>
                            ))}
                          </div>
                        </li>
                      ))
                    ) : (
                      <li className="list-none text-slate-500">No matching legs found on today’s board.</li>
                    )}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
