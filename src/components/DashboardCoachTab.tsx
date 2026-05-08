"use client";

import { useState } from "react";

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

function Meter({
  label,
  value,
  tone = "sky"
}: {
  label: string;
  value: number;
  tone?: "sky" | "emerald" | "amber";
}) {
  const pctValue = Math.max(0, Math.min(100, value * 100));
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-500"
      : tone === "amber"
        ? "bg-amber-500"
        : "bg-sky-500";
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px] text-slate-400">
        <span>{label}</span>
        <span>{pct(value, 2)}</span>
      </div>
      <div className="h-2 w-full rounded bg-slate-800/80">
        <div className={`h-2 rounded ${toneClass}`} style={{ width: `${pctValue}%` }} />
      </div>
    </div>
  );
}

export function DashboardCoachTab() {
  const [active, setActive] = useState<"coach" | "report">("coach");
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<Array<{ role: "user" | "coach"; text: string }>>([]);
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
      setChat((prev) => [
        ...prev,
        { role: "user", text: "Generate a strong random 3-leg parlay from live board." },
        { role: "coach", text: typeof data?.answer === "string" ? data.answer : "Coach could not generate a response." }
      ]);
      setReport(data?.parlayReport ?? null);
    } catch {
      setMessage("Coach request failed. Please retry.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }

  async function askCoach() {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setChat((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, payload: {} })
      });
      const data = await res.json();
      const answer = typeof data?.answer === "string" ? data.answer : "Coach could not generate a response.";
      setMessage(answer);
      setChat((prev) => [...prev, { role: "coach", text: answer }]);
      setReport(data?.parlayReport ?? null);
      if (data?.parlayReport) setActive("report");
    } catch {
      const fallback = "Request failed. Try again in a moment.";
      setMessage(fallback);
      setChat((prev) => [...prev, { role: "coach", text: fallback }]);
    } finally {
      setLoading(false);
    }
  }

  async function askPreset(q: string) {
    if (loading) return;
    setQuestion(q);
    setLoading(true);
    setChat((prev) => [...prev, { role: "user", text: q }]);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, payload: {} })
      });
      const data = await res.json();
      const answer = typeof data?.answer === "string" ? data.answer : "Coach could not generate a response.";
      setMessage(answer);
      setChat((prev) => [...prev, { role: "coach", text: answer }]);
      setReport(data?.parlayReport ?? null);
      if (data?.parlayReport) setActive("report");
    } catch {
      const fallback = "Request failed. Try again in a moment.";
      setMessage(fallback);
      setChat((prev) => [...prev, { role: "coach", text: fallback }]);
    } finally {
      setLoading(false);
      setQuestion("");
    }
  }

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
          <p className="text-slate-300">Ask anything about props, edges, bankroll sizing, or request a random parlay.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-muted text-xs" onClick={() => void askPreset("Build best value 3-leg parlay")}>
              Best Value 3-Leg
            </button>
            <button className="btn-muted text-xs" onClick={() => void askPreset("Build safest 3-leg parlay by hit chance")}>
              Safest 3-Leg
            </button>
            <button className="btn-muted text-xs" onClick={() => void askPreset("Give me latest injury/weather/news angles before betting")}>
              News/Context Angles
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void askCoach();
                }
              }}
              placeholder="Ask coach (e.g., build best 3-leg value parlay)"
              className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
            />
            <button type="button" className="btn-muted text-sm" onClick={askCoach} disabled={loading || !question.trim()}>
              {loading ? "..." : "Ask"}
            </button>
            <button type="button" className="btn-muted text-sm" onClick={generateRandomParlay} disabled={loading}>
              {loading ? "..." : "Generate"}
            </button>
          </div>
          <div className="thin-scrollbar max-h-56 space-y-2 overflow-y-auto pr-1">
            {chat.length ? (
              chat.map((m, idx) => (
                <div
                  key={`${m.role}-${idx}`}
                  className={`rounded border p-2 text-xs whitespace-pre-line ${
                    m.role === "user"
                      ? "border-sky-700/60 bg-sky-950/20 text-sky-100"
                      : "border-slate-700/70 bg-slate-950/60 text-slate-200"
                  }`}
                >
                  <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-400">
                    {m.role === "user" ? "You" : "Coach"}
                  </span>
                  {m.text}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">No chat yet. Ask a question or generate a parlay.</p>
            )}
          </div>
          {message && !chat.length ? (
            <p className="rounded border border-slate-700/70 bg-slate-950/60 p-2 text-xs text-slate-300 whitespace-pre-line">{message}</p>
          ) : null}
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
                <div className="mt-2">
                  <Meter label="Parlay Probability Meter" value={report.parlayHitProbability} tone="amber" />
                </div>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                {report.legs.map((leg, idx) => (
                  <div key={`${leg.selection}-${idx}`} className="rounded border border-slate-700/60 bg-slate-950/40 p-2">
                    <p className="font-medium text-slate-100">{leg.selection}</p>
                    <p className="text-slate-400">Odds: {american(leg.oddsAmerican)} · Hit: {pct(leg.hitProbability, 2)} · Implied: {pct(leg.impliedProbability, 2)}</p>
                    <div className="mt-2 space-y-2">
                      <Meter label="Hit probability" value={leg.hitProbability} tone="emerald" />
                      <Meter label="Implied probability" value={leg.impliedProbability} tone="sky" />
                    </div>
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

