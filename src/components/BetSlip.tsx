"use client";

import { useEffect, useState } from "react";
import { useBetStore } from "@/store/betStore";

const ODDS_PRESET_OPTIONS = Array.from({ length: 2001 }, (_, i) => i - 1000).filter((n) => n !== 0);

export function BetSlip() {
  const { bets, bankroll, unitSize, setBankroll, setUnitSize, updateBetOdds, removeBet, clear } = useBetStore();
  const [draftOdds, setDraftOdds] = useState<Record<string, string>>({});

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const b of bets) next[b.id] = String(b.oddsAmerican > 0 ? `+${b.oddsAmerican}` : b.oddsAmerican);
    setDraftOdds(next);
  }, [bets]);

  function commitOdds(id: string) {
    const raw = (draftOdds[id] ?? "").trim();
    if (!raw) return;
    const normalized = raw.replace(/\s+/g, "");
    if (!/^[+-]?\d+$/.test(normalized)) return;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n === 0) return;
    updateBetOdds(id, Math.round(n));
    setDraftOdds((s) => ({ ...s, [id]: n > 0 ? `+${Math.round(n)}` : String(Math.round(n)) }));
  }

  function tryLiveUpdate(id: string, rawValue: string) {
    const normalized = rawValue.trim().replace(/\s+/g, "");
    if (!/^[+-]?\d+$/.test(normalized)) return;
    const n = Number(normalized);
    if (!Number.isFinite(n) || n === 0) return;
    updateBetOdds(id, Math.round(n));
  }

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
            <div className="mt-1 flex items-center gap-2">
              <label className="text-[11px] text-slate-400">
                Odds
                <input
                  className="ml-2 w-24 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
                  type="text"
                  inputMode="text"
                  value={draftOdds[bet.id] ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDraftOdds((s) => ({ ...s, [bet.id]: v }));
                    // Apply immediately when value is parseable, while still allowing
                    // partial states like "-", "+", or empty during editing.
                    tryLiveUpdate(bet.id, v);
                  }}
                  onBlur={() => commitOdds(bet.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitOdds(bet.id);
                    }
                  }}
                />
              </label>
              <label className="text-[11px] text-slate-400">
                Preset
                <select
                  className="ml-2 w-24 rounded border border-slate-700 bg-slate-950 px-1 py-1 text-xs text-slate-100"
                  value=""
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (!raw) return;
                    setDraftOdds((s) => ({ ...s, [bet.id]: raw }));
                    tryLiveUpdate(bet.id, raw);
                    // keep placeholder selected after each pick
                    e.currentTarget.value = "";
                  }}
                >
                  <option value="">Select</option>
                  {ODDS_PRESET_OPTIONS.map((n) => (
                    <option key={n} value={n > 0 ? `+${n}` : `${n}`}>
                      {n > 0 ? `+${n}` : n}
                    </option>
                  ))}
                </select>
              </label>
              <span className="text-xs text-slate-500">({bet.oddsAmerican > 0 ? `+${bet.oddsAmerican}` : bet.oddsAmerican})</span>
            </div>
            <div className="mt-1 flex items-center justify-end">
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
