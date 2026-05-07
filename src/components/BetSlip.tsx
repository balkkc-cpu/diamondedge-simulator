"use client";

import { useBetStore } from "@/store/betStore";

export function BetSlip() {
  const { bets, bankroll, unitSize, setBankroll, setUnitSize, removeBet, clear } = useBetStore();
  return (
    <aside className="panel p-4">
      <h3 className="mb-3 text-lg font-semibold text-blue-200">Bet Slip</h3>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label className="text-slate-300">
          Bankroll
          <input
            className="mt-1 w-full rounded bg-slate-900 p-2"
            type="number"
            value={bankroll}
            onChange={(e) => setBankroll(Number(e.target.value))}
          />
        </label>
        <label className="text-slate-300">
          Unit Size
          <input
            className="mt-1 w-full rounded bg-slate-900 p-2"
            type="number"
            value={unitSize}
            onChange={(e) => setUnitSize(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="mt-3 space-y-2">
        {bets.map((bet) => (
          <div key={bet.id} className="rounded bg-slate-900 p-2 text-sm">
            <div className="font-medium">{bet.selection}</div>
            <div className="text-slate-400">{bet.marketType}</div>
            <div className="flex items-center justify-between">
              <span>{bet.oddsAmerican > 0 ? `+${bet.oddsAmerican}` : bet.oddsAmerican}</span>
              <button className="text-red-300" onClick={() => removeBet(bet.id)}>
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        After you run the sim, each leg shows a suggested unit tag and plain-language why it could hit or miss on the
        results page (stake tags use your bankroll + unit size inputs).
      </p>
      <button className="btn-muted mt-3 w-full" onClick={clear}>
        Clear Slip
      </button>
    </aside>
  );
}
