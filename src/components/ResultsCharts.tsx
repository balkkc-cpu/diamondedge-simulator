"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function ResultsCharts({ histogram }: { histogram: Array<{ runs: number; frequency: number }> }) {
  return (
    <div className="panel p-4">
      <h3 className="mb-3 text-lg font-semibold text-blue-200">Total Runs Distribution</h3>
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <BarChart data={histogram}>
            <XAxis dataKey="runs" stroke="#cbd5e1" />
            <YAxis stroke="#cbd5e1" />
            <Tooltip />
            <Bar dataKey="frequency" fill="#60A5FA" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
