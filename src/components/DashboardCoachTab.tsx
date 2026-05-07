"use client";

import { useEffect, useState } from "react";

type ReportLeg = {
  selection: string;
  oddsAmerican: number;
  hitProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  suggestedUnits: number;
};

type ParlayReport = {
  parlayHitProbability: number;
  combinedAmerican: number;
  legs: ReportLeg[];
};

function pct(n: number, d = 1): string {
  return `${(n * 100).toFixed(d)}%`;
}

function american(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function DashboardCoachTab() {
  const [active, setActive] = useState<"coach" | "report">("coach");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<ParlayReport | null>(null);

  async function generateRandomParlay() {
    setLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: "best random 3-leg parlay", payload: {} })
      });
      const data = await res.json();
      setMessage(typeof data?.answer === "string" ? data.answer : "Coach could not generate a response.");
      setReport(data?.parlayReport ?? null);
      setActive("report");
    } catch {
      setMessage("Coach request failed. Please retry.");
      setReport(null);
      setActive("coach");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!report && !loading) {
      void generateRandomParlay();
    }
  }, []); // run once on first mount

  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-violet-200">Coach</h3>
        <div className="flex gap-2 text-xs">
          <button type="button" className={active === "coach" ? "btn-muted bg-slate-800/70" : "btn-muted"} onClick={() => setActive("coach")}>
            Coach
          </button>
          <button type="button" className={active === "report" ? "btn-muted bg-slate-800/70" : "btn-muted"} onClick={() => setActive("report")}>
            Sim Report
          </button>
        </div>
      </div>

      {active === "coach" ? (
        <div className="space-y-3 text-sm">
          <p className="text-slate-300">
            Tap once to generate a truly random mixed-prop parlay. Every request runs a fresh random sample and picks the strongest hit-rate ticket.
          </p>
          <button type="button" className="btn-muted text-sm" onClick={generateRandomParlay} disabled={loading}>
            {loading ? "Generating..." : "Generate New Random Parlay"}
          </button>
          {message ? <p className="rounded border border-slate-700/70 bg-slate-950/60 p-2 text-xs text-slate-300 whitespace-pre-line">{message}</p> : null}
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          {message ? (
            <div className="rounded border border-slate-700/70 bg-slate-950/50 p-2 text-slate-300 whitespace-pre-line">
              {message}
            </div>
          ) : null}
          {report ? (
            <>
              <div className="rounded border border-slate-700/70 bg-slate-950/60 p-2">
                <p className="text-slate-200">Parlay hit chance: <span className="font-semibold">{pct(report.parlayHitProbability, 2)}</span></p>
                <p className="text-slate-400">Combined odds: {american(report.combinedAmerican)}</p>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {report.legs.map((leg, idx) => (
                  <div key={`${leg.selection}-${idx}`} className="rounded border border-slate-700/60 bg-slate-950/40 p-2">
                    <p className="font-medium text-slate-100">{leg.selection}</p>
                    <p className="text-slate-400">Odds: {american(leg.oddsAmerican)} · Hit: {pct(leg.hitProbability, 2)} · Implied: {pct(leg.impliedProbability, 2)}</p>
                    <p className={leg.edge >= 0 ? "text-emerald-300" : "text-rose-300"}>
                      Edge: {pct(leg.edge, 2)} · EV: {leg.expectedValue.toFixed(2)}u · Units: {leg.suggestedUnits}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded border border-slate-700/70 bg-slate-950/50 p-3">
              <p className="text-slate-400">No report yet. Generate a random parlay to populate this window.</p>
              <button type="button" className="btn-muted mt-2 text-xs" onClick={generateRandomParlay} disabled={loading}>
                {loading ? "Generating..." : "Generate now"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

