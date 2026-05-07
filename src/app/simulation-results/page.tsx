"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ResultsCharts } from "@/components/ResultsCharts";
import { buildAutoCoachIntro } from "@/lib/simCoach";

type LegBreakdown = {
  betId: string;
  selection: string;
  whyItCouldHit: string[];
  whyItCouldMiss: string[];
  summary: string;
  stakeGuidance: string;
};

type SimRow = {
  betId: string;
  hitProbability: number;
  impliedProbability: number;
  edge: number;
  expectedValue: number;
  confidenceScore: number;
  risk: string;
  suggestedUnits: number;
  suggestedUnitsNote: string;
};

type SuggestedParlay = {
  title: string;
  style: string;
  legs: Array<{ betId: string; selection: string; hitProbability: number }>;
  parlayHitProbability: number;
  note: string;
};

type ParlayPreset = 2 | 3 | 4;

function pct(n: number, d = 1): string {
  return `${(Number(n) * 100).toFixed(d)}%`;
}

function classifySelection(selection: string): "hr" | "bases" | "hits" | "rbis" | "other" {
  const s = selection.toLowerCase();
  if (s.includes("home run") || s.includes("player_hr") || /\bhr\b/.test(s)) return "hr";
  if (s.includes("total bases") || /\btb\b/.test(s)) return "bases";
  if (s.includes(" rbi") || s.includes("rbis") || /\brbi\b/.test(s)) return "rbis";
  if (s.includes(" hits") || /\bhits\b/.test(s)) return "hits";
  return "other";
}

function stableHash(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickParlay(
  title: string,
  style: string,
  rows: Array<{ betId: string; selection: string; hitProbability: number; edge: number }>,
  opts?: { minLegs?: number; maxLegs?: number; minHit?: number }
): SuggestedParlay {
  const minLegs = opts?.minLegs ?? 2;
  const maxLegs = opts?.maxLegs ?? 3;
  const minHit = opts?.minHit ?? 0;
  const sorted = [...rows]
    .filter((r) => r.hitProbability >= minHit)
    .sort((a, b) => (b.edge + b.hitProbability * 0.6) - (a.edge + a.hitProbability * 0.6));
  const legs = sorted.slice(0, Math.max(minLegs, Math.min(maxLegs, sorted.length)));
  const parlayHitProbability = legs.reduce((acc, x) => acc * x.hitProbability, 1);
  return {
    title,
    style,
    legs,
    parlayHitProbability: legs.length ? parlayHitProbability : 0,
    note: legs.length
      ? `Built from your strongest ${style} legs in this sim run.`
      : `No qualifying ${style} legs were found in this slip.`
  };
}

export default function SimulationResultsPage() {
  const [payload, setPayload] = useState<any>(null);
  const [saveMsg, setSaveMsg] = useState("");
  const [parlaySize, setParlaySize] = useState<ParlayPreset>(3);
  const [coachInput, setCoachInput] = useState("");
  const [coachMessages, setCoachMessages] = useState<Array<{ role: "user" | "coach"; text: string }>>([]);
  const [coachLoading, setCoachLoading] = useState(false);

  async function askCoach(raw: string) {
    const q = raw.trim();
    if (!q || coachLoading) return;
    setCoachMessages((prev) => [...prev, { role: "user", text: q }]);
    setCoachInput("");
    setCoachLoading(true);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, payload })
      });
      const data = await res.json();
      const answer = typeof data?.answer === "string" ? data.answer : "Coach could not answer right now. Try again.";
      setCoachMessages((prev) => [...prev, { role: "coach", text: answer }]);
    } catch {
      setCoachMessages((prev) => [
        ...prev,
        { role: "coach", text: "Coach service is temporarily unavailable. Please retry in a moment." }
      ]);
    } finally {
      setCoachLoading(false);
    }
  }

  useEffect(() => {
    const raw = sessionStorage.getItem("diamondedge_results");
    if (raw) setPayload(JSON.parse(raw));
  }, []);

  useEffect(() => {
    if (!payload?.results?.length) return;
    const intro = buildAutoCoachIntro(payload);
    setCoachMessages([{ role: "coach", text: intro }]);
  }, [payload]);

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

  const suggestedParlays = useMemo(() => {
    if (!payload?.results?.length) return [] as SuggestedParlay[];
    const rows = (payload.results as SimRow[]).map((r) => ({
      betId: r.betId,
      selection: byBetId.get(r.betId)?.selection ?? r.betId,
      hitProbability: r.hitProbability,
      edge: r.edge
    }));
    const hrRows = rows.filter((r) => classifySelection(r.selection) === "hr");
    const baseRows = rows.filter((r) => classifySelection(r.selection) === "bases");
    const hitRows = rows.filter((r) => classifySelection(r.selection) === "hits");
    const rbiRows = rows.filter((r) => classifySelection(r.selection) === "rbis");

    const maxLegs = parlaySize;
    const minLegs = Math.min(2, maxLegs);

    const hr = pickParlay("Home Run Parlay", "home run", hrRows, { minLegs, maxLegs: Math.min(2, maxLegs), minHit: 0.08 });
    const bases = pickParlay("Total Bases Parlay", "total bases", baseRows, { minLegs, maxLegs, minHit: 0.2 });
    const hits = pickParlay("Hits Parlay", "hits", hitRows, { minLegs, maxLegs, minHit: 0.2 });
    const rbis = pickParlay("RBIs Parlay", "RBIs", rbiRows, { minLegs, maxLegs, minHit: 0.2 });

    const safestPool = [...rows].sort((a, b) => b.hitProbability - a.hitProbability).slice(0, 10);
    const seed = stableHash(safestPool.map((x) => x.betId).join("|"));
    const mixed: typeof safestPool = [];
    for (let i = 0; i < safestPool.length && mixed.length < maxLegs; i++) {
      const idx = (seed + i * 5) % safestPool.length;
      const next = safestPool[idx];
      if (next && !mixed.some((m) => m.betId === next.betId)) mixed.push(next);
    }
    const randomGood: SuggestedParlay = {
      title: "Random But High-Probability Mix",
      style: "mixed",
      legs: mixed.slice(0, Math.max(2, mixed.length)),
      parlayHitProbability: mixed.slice(0, Math.max(2, mixed.length)).reduce((acc, x) => acc * x.hitProbability, 1),
      note: "Randomized from your safest legs so it still has a strong chance to hit."
    };

    return [hr, bases, hits, rbis, randomGood];
  }, [payload, byBetId, parlaySize]);

  if (!payload) return <main className="panel p-4">No simulation yet. Run one from Bet Builder.</main>;

  return (
    <main className="grid gap-4">
      <section className="panel overflow-hidden p-0">
        <div className="bg-gradient-to-r from-sky-900/50 via-indigo-900/40 to-slate-900/30 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-blue-100">Simulation Results</h2>
              <p className="text-xs text-slate-200/90">{payload.disclaimer}</p>
              <p className="mt-2 text-xs text-slate-300/90">
                Human-readable sim card: each leg shows hit chance, price break-even, value edge, and a practical stake tag.
              </p>
            </div>
            <div className="rounded-lg border border-sky-300/20 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
              <p className="font-semibold text-sky-300">Parlay hit chance</p>
              <p className="text-lg font-bold text-slate-100">{pct(payload.parlayHitProbability, 2)}</p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">
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
        </div>
      </section>
      <section className="panel p-4 text-sm">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-violet-200">AI Bet Coach</h3>
          <span className="rounded bg-violet-900/30 px-2 py-1 text-[11px] text-violet-200">real-terms explainer</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Ask plain questions about this exact simulation run: safest leg, what can miss, best value, or stake sizing.
        </p>
        <div className="mt-3 rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-violet-200">Quick coach commands</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              "best random 3-leg parlay",
              "best 4-leg for highest hit chance",
              "best 4-leg value parlay",
              "best 5-leg with at least +100 combined price",
              "best 6-leg with at least +200 combined price",
              "safest leg and why"
            ].map((cmd) => (
              <button
                key={cmd}
                type="button"
                className="btn-muted text-[11px]"
                onClick={() => askCoach(cmd)}
                disabled={coachLoading}
                title={cmd}
              >
                {cmd}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
          {coachMessages.map((m, i) => (
            <div key={i} className={m.role === "coach" ? "rounded-md bg-slate-900/90 p-2 text-slate-200" : "rounded-md bg-sky-900/30 p-2 text-sky-100"}>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">{m.role === "coach" ? "Coach" : "You"}</p>
              <p className="text-xs">{m.text}</p>
            </div>
          ))}
        </div>
        <form
          className="mt-3 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            await askCoach(coachInput);
          }}
        >
          <input
            value={coachInput}
            onChange={(e) => setCoachInput(e.target.value)}
            placeholder="Ask: What leg is safest and why?"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 outline-none ring-sky-400/50 placeholder:text-slate-500 focus:ring"
          />
          <button type="submit" className="btn-muted text-xs" disabled={coachLoading}>
            {coachLoading ? "Thinking..." : "Ask coach"}
          </button>
        </form>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        {payload.results.map((r: SimRow) => {
          const leg = byBetId.get(r.betId);
          return (
            <article key={r.betId} className="panel flex flex-col gap-3 border border-slate-700/80 bg-gradient-to-b from-slate-900/90 to-slate-950/60 p-4 text-sm">
              <div>
                <h3 className="font-semibold text-slate-100">{leg?.selection ?? r.betId}</h3>
                <p className="text-xs text-slate-500">Leg id: {r.betId}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                <p>
                  <span className="text-slate-400">Hit chance:</span> {pct(r.hitProbability)}
                </p>
                <p>
                  <span className="text-slate-400">Book break-even:</span> {pct(r.impliedProbability)}
                </p>
                <p className={r.edge > 0 ? "text-positive" : "text-negative"}>
                  <span className="text-slate-400">Value edge:</span> {pct(r.edge)}
                </p>
                <p>
                  <span className="text-slate-400">Return per 1u risked:</span> {r.expectedValue.toFixed(3)}u
                </p>
                <p>
                  <span className="text-slate-400">Confidence meter:</span> {r.confidenceScore}/100
                </p>
                <p>
                  <span className="text-slate-400">Volatility:</span> {r.risk}
                </p>
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
                  <p className="rounded border border-slate-700/70 bg-slate-900/80 p-2 text-slate-300">{leg.summary}</p>
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
        <h3 className="font-semibold">Parlay quick read</h3>
        <p className="mt-1 text-slate-300">
          Estimated chance your full parlay cashes: <span className="font-semibold text-slate-100">{pct(payload.parlayHitProbability)}</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">
          This estimate assumes legs are mostly independent, so treat it as directional.
        </p>
        <div className="mt-3 grid gap-2 rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
          <p>
            <span className="font-medium text-slate-200">Best single bet to play alone:</span>{" "}
            <span className="text-slate-300">{payload.recommendations.bestStraight || "N/A"}</span>
          </p>
          <p>
            <span className="font-medium text-slate-200">Best parlay combo:</span>{" "}
            <span className="text-slate-300">{payload.recommendations.bestParlay || "N/A"}</span>
          </p>
          <p>
            <span className="font-medium text-slate-200">Safest leg:</span>{" "}
            <span className="text-slate-300">{payload.recommendations.safest || "N/A"}</span>
          </p>
          <p>
            <span className="font-medium text-slate-200">Most boom-or-bust leg:</span>{" "}
            <span className="text-slate-300">{payload.recommendations.highestUpside || "N/A"}</span>
          </p>
        </div>
      </section>
      <section className="panel p-4 text-sm">
        <h3 className="font-semibold">Suggested parlays</h3>
        <p className="mt-1 text-xs text-slate-500">
          These are auto-built from your current slip and this simulation run. Lower hit rates can still pay more; higher hit rates are usually lower payout.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Parlay size:</span>
          <button
            type="button"
            className={parlaySize === 2 ? "btn-muted bg-slate-800/70" : "btn-muted"}
            onClick={() => setParlaySize(2)}
          >
            2-leg (safer)
          </button>
          <button
            type="button"
            className={parlaySize === 3 ? "btn-muted bg-slate-800/70" : "btn-muted"}
            onClick={() => setParlaySize(3)}
          >
            3-leg (balanced)
          </button>
          <button
            type="button"
            className={parlaySize === 4 ? "btn-muted bg-slate-800/70" : "btn-muted"}
            onClick={() => setParlaySize(4)}
          >
            4-leg (lotto)
          </button>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {suggestedParlays.map((p) => (
            <article key={p.title} className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
              <p className="font-medium text-slate-100">{p.title}</p>
              <p className="mt-1 text-xs text-slate-400">{p.note}</p>
              <p className="mt-1 text-xs">
                <span className="text-slate-400">Estimated hit chance:</span>{" "}
                <span className="font-semibold text-slate-100">{pct(p.parlayHitProbability, 2)}</span>
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-slate-300">
                {p.legs.length ? (
                  p.legs.map((leg) => (
                    <li key={`${p.title}-${leg.betId}`}>
                      {leg.selection} <span className="text-slate-500">({pct(leg.hitProbability)})</span>
                    </li>
                  ))
                ) : (
                  <li className="list-none text-slate-500">No matching legs in this slip yet.</li>
                )}
              </ul>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
