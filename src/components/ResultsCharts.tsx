"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type HistogramBin = { runs: number; frequency: number };

export type ResultsLegDatum = {
  selection: string;
  hitProbability: number;
  edge: number;
};

function buildCumulative(histogram: HistogramBin[]) {
  const sorted = [...histogram].sort((a, b) => a.runs - b.runs);
  const total = sorted.reduce((s, h) => s + h.frequency, 0) || 1;
  let cum = 0;
  return sorted.map((h) => {
    cum += h.frequency;
    return { runs: h.runs, cumulativePct: +((cum / total) * 100).toFixed(2) };
  });
}

export function ResultsCharts({
  histogram,
  legs = []
}: {
  histogram: HistogramBin[];
  legs?: ResultsLegDatum[];
}) {
  const cumulative = buildCumulative(histogram);
  const legData = legs.map((r) => ({
    label: r.selection.length > 36 ? `${r.selection.slice(0, 34)}…` : r.selection,
    fullLabel: r.selection,
    hitPct: +(r.hitProbability * 100).toFixed(2),
    edgePts: +(r.edge * 100).toFixed(2)
  }));

  const totalFreq = histogram.reduce((s, h) => s + h.frequency, 0);

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-4 lg:overflow-hidden">
        <h3 className="mb-3 text-lg font-semibold text-blue-200">Total Runs Distribution</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          {totalFreq.toLocaleString()} Monte Carlo draws · bar height = frequency per total-runs outcome.
        </p>
        <div className="h-72 w-full min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[...histogram].sort((a, b) => a.runs - b.runs)} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="runs" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                labelStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="frequency" radius={[4, 4, 0, 0]} fill="#60A5FA" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="panel p-4 lg:overflow-hidden">
        <h3 className="mb-3 text-lg font-semibold text-violet-200">Cumulative Share</h3>
        <p className="mb-3 text-[11px] text-slate-500">
          Share of simulations at or below each total-runs outcome (read right for tails).
        </p>
        <div className="h-72 w-full min-h-[220px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulative} margin={{ left: 4, right: 8, top: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.85} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis dataKey="runs" stroke="#94a3b8" fontSize={11} />
              <YAxis stroke="#94a3b8" domain={[0, 100]} fontSize={11} tickFormatter={(v) => `${v}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                formatter={(v: number) => [`${v}%`, "Cumulative"]}
                labelFormatter={(label) => `Runs ≤ ${label}`}
              />
              <Area type="monotone" dataKey="cumulativePct" stroke="#c4b5fd" strokeWidth={2} fill="url(#cumFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {legData.length ? (
        <div className="panel p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-emerald-200">Leg Hit Rate vs Edge</h3>
              <p className="mt-1 text-[11px] text-slate-500">Horizontal bars compare modeled hit probability; edge shown in tooltip (pct points).</p>
            </div>
          </div>
          <div
            className="w-full min-h-[200px] max-h-[28rem]"
            style={{ height: Math.min(448, Math.max(200, legData.length * 44)) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart layout="vertical" data={legData} margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} opacity={0.5} />
                <XAxis type="number" domain={[0, 100]} stroke="#94a3b8" fontSize={11} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="label" width={140} stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload: rows }) => {
                    if (!active || !rows?.length) return null;
                    const p = rows[0]?.payload as { fullLabel?: string; hitPct?: number; edgePts?: number };
                    if (!p) return null;
                    const edge = typeof p.edgePts === "number" ? p.edgePts : 0;
                    return (
                      <div className="rounded-lg border border-slate-600 bg-slate-950/95 px-3 py-2 text-xs text-slate-100 shadow-xl backdrop-blur-sm">
                        <p className="max-w-xs font-medium text-emerald-200">{p.fullLabel ?? ""}</p>
                        <p className="mt-1 text-slate-300">Hit: {p.hitPct ?? 0}%</p>
                        <p className="text-slate-300">
                          Edge: {edge >= 0 ? "+" : ""}
                          {edge} pts
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="hitPct" radius={[0, 6, 6, 0]} fill="#34d399" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </section>
  );
}
