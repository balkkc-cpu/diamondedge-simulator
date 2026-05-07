"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResultsCharts } from "@/components/ResultsCharts";

type LegBreakdown = {
  betId: string;
  selection: string;
  whyItCouldHit: string[];
  whyItCouldMiss: string[];
  summary: string;
  stakeGuidance: string;
};

export default function SimulationResultsPage() {
  const [payload, setPayload] = useState<any>(null);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    const raw = sessionStorage.getItem("diamondedge_results");
    if (raw) setPayload(JSON.parse(raw));
  }, []);

  async function saveSimulation() {
    setSaveMsg("");
    if (!payload) return;
    const title = window.prompt("Name this simulation run", `Sim ${new Date().toLocaleDateString()}`);
    if (title === null) return;
    const res = await fetch("/api/saved-simulations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title || null, payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setSaveMsg(data.error === "Unauthorized" ? "Log in to save runs." : data.error ?? "Save failed");
      return;
    }
    setSaveMsg("Saved — see My library.");
  }

  const byBetId = useMemo(() => {
    const map = new Map<string, LegBreakdown>();
    for (const b of (payload?.breakdowns ?? []) as LegBreakdown[]) {
      map.set(b.betId, b);
    }
    return map;
  }, [payload]);

  if (!payload) return <main className="panel p-4">No simulation yet. Run one from Bet Builder.</main>;

  return (
    <main className="grid gap-4">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold text-blue-200">Simulation Results</h2>
        <p className="text-xs text-slate-300">{payload.disclaimer}</p>
        <p className="mt-2 text-xs text-slate-500">
          Each leg includes stake guidance in abstract units (multiply by your unit size for a dollar tag). This is
          research output, not betting advice.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-muted text-sm" onClick={saveSimulation}>
            Save run to account
          </button>
          <Link href="/library" className="btn-muted text-sm">
            My library
          </Link>
        </div>
        {saveMsg ? <p className="mt-2 text-xs text-slate-400">{saveMsg}</p> : null}
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {payload.results.map((r: any) => {
          const leg = byBetId.get(r.betId);
          return (
            <article key={r.betId} className="panel flex flex-col gap-3 p-4 text-sm">
              <div>
                <h3 className="font-semibold text-slate-100">{leg?.selection ?? r.betId}</h3>
                <p className="text-xs text-slate-500">Leg id: {r.betId}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                <p>Hit: {(r.hitProbability * 100).toFixed(1)}%</p>
                <p>Breakeven: {(r.impliedProbability * 100).toFixed(1)}%</p>
                <p className={r.edge > 0 ? "text-positive" : "text-negative"}>Edge: {(r.edge * 100).toFixed(1)} pts</p>
                <p>EV: {r.expectedValue.toFixed(3)} u / 1 risked</p>
                <p>Confidence: {r.confidenceScore}/100</p>
                <p>Risk: {r.risk}</p>
              </div>
              <div className="rounded-lg border border-slate-700/80 bg-slate-950/60 p-3">
                <p className="text-[11px] font-bold uppercase tracking-wide text-sky-400/90">Suggested units</p>
                <p className="mt-1 text-lg font-semibold text-slate-100">{r.suggestedUnits}</p>
                <p className="mt-1 text-xs text-slate-400">{r.suggestedUnitsNote}</p>
                {payload.unitSize ? (
                  <p className="mt-2 text-xs text-slate-500">
                    At unit size ${Number(payload.unitSize).toFixed(0)}, a {r.suggestedUnits}u tag ≈ $
                    {(Number(payload.unitSize) * Number(r.suggestedUnits)).toFixed(0)} notional (illustrative only).
                  </p>
                ) : null}
              </div>
              {leg ? (
                <div className="grid gap-3 border-t border-slate-700/50 pt-3 text-xs text-slate-300">
                  <p className="text-slate-400">{leg.summary}</p>
                  <div>
                    <p className="font-semibold text-emerald-400/90">Why it could hit</p>
                    <ul className="mt-1 list-inside list-disc space-y-1">
                      {leg.whyItCouldHit.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-400/90">Why it could miss</p>
                    <ul className="mt-1 list-inside list-disc space-y-1">
                      {leg.whyItCouldMiss.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="rounded bg-slate-900/80 p-2 text-slate-400">{leg.stakeGuidance}</p>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
      <ResultsCharts histogram={payload.histogram} />
      <section className="panel p-4 text-sm">
        <h3 className="font-semibold">Parlay analytics</h3>
        <p>Parlay hit probability (independence approx): {(payload.parlayHitProbability * 100).toFixed(2)}%</p>
        <p>Best straight (by sim id): {payload.recommendations.bestStraight}</p>
        <p>Best parlay combo: {payload.recommendations.bestParlay}</p>
        <p>Safest leg: {payload.recommendations.safest}</p>
        <p>Highest upside: {payload.recommendations.highestUpside}</p>
      </section>
    </main>
  );
}
