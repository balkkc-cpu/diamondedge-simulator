"use client";

import type { NbaShotMarker } from "@/lib/nbaLiveGame";
import { useId, useMemo } from "react";

/**
 * NBA play-by-play `x` / `y` are percentages on a canonical full court:
 * x = 0 at one baseline toward 100 at the other (along 94 ft).
 * y = 0–100 across the 50 ft width (sideline to sideline), ~50 at center.
 */
function shotToPercent(s: NbaShotMarker): { x: number; y: number } | null {
  if (typeof s.xPct === "number" && typeof s.yPct === "number" && Number.isFinite(s.xPct) && Number.isFinite(s.yPct)) {
    return { x: Math.max(0, Math.min(100, s.xPct)), y: Math.max(0, Math.min(100, s.yPct)) };
  }
  return null;
}

/** Full court in NBA percentage space (100 × 100), displayed at 94:50 physical aspect. */
export function NbaCourtShotChart({
  shots,
  highlightActionNumber
}: {
  shots: NbaShotMarker[];
  highlightActionNumber?: number | null;
}) {
  const uid = useId().replace(/:/g, "");
  const woodId = `nba-wood-${uid}`;
  const clipId = `nba-clip-${uid}`;

  const positioned = useMemo(() => {
    return shots
      .map((s) => ({ s, pos: shotToPercent(s) }))
      .filter((x): x is { s: NbaShotMarker; pos: { x: number; y: number } } => x.pos != null);
  }, [shots]);

  const highlightShot = useMemo(
    () => (highlightActionNumber != null ? shots.find((s) => s.actionNumber === highlightActionNumber) : undefined),
    [shots, highlightActionNumber]
  );

  const wKey = (19 / 94) * 100;
  const hKey = (16 / 50) * 100;
  const yKey0 = 50 - hKey / 2;
  const rimLx = (5.25 / 94) * 100;
  const rimRx = 100 - rimLx;
  const ftLineLx = (19 / 94) * 100;
  const ftLineRx = 100 - ftLineLx;
  const raR = (4 / 94) * 100;
  const arcRx = (23.75 / 94) * 100;
  const arcRy = (23.75 / 50) * 100;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-amber-700/40 bg-gradient-to-b from-[#1a0f08] via-[#0f1419] to-[#0a1628] shadow-inner">
      <div className="absolute inset-x-0 top-0 border-b border-white/10 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-widest text-amber-200/80">
        Full court · NBA coordinate space (94′ × 50′)
      </div>
      {/* Physical NBA aspect: length : width = 94 : 50 */}
      <div className="relative mx-auto mt-7 w-full max-w-3xl" style={{ aspectRatio: "94 / 50" }}>
        <svg viewBox="0 0 100 100" className="h-full w-full text-amber-100/25" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={woodId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2a1810" />
              <stop offset="45%" stopColor="#1a1512" />
              <stop offset="100%" stopColor="#152a38" />
            </linearGradient>
            <clipPath id={clipId}>
              <rect x="0.4" y="0.4" width="99.2" height="99.2" rx="0.6" />
            </clipPath>
          </defs>

          <g clipPath={`url(#${clipId})`}>
            <rect x="0.4" y="0.4" width="99.2" height="99.2" rx="0.6" fill={`url(#${woodId})`} stroke="currentColor" strokeWidth="0.35" />

            {/* Midcourt */}
            <line x1="50" y1="0.4" x2="50" y2="99.6" stroke="currentColor" strokeWidth="0.35" strokeDasharray="1.6 1" />

            {/* Left paint + FT line + restricted arc */}
            <rect x="0.4" y={yKey0} width={wKey - 0.1} height={hKey} fill="none" stroke="currentColor" strokeWidth="0.3" />
            <line x1={ftLineLx} y1={yKey0} x2={ftLineLx} y2={yKey0 + hKey} stroke="currentColor" strokeWidth="0.28" />
            <path
              d={`M ${rimLx - raR} ${50} A ${raR} ${raR * 0.95} 0 0 0 ${rimLx + raR} ${50}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.26"
            />
            <ellipse cx={ftLineLx} cy="50" rx={(6 / 94) * 100} ry={(6 / 50) * 100} fill="none" stroke="currentColor" strokeWidth="0.24" />

            {/* Right paint + FT line + restricted arc */}
            <rect x={100 - 0.4 - wKey + 0.1} y={yKey0} width={wKey - 0.1} height={hKey} fill="none" stroke="currentColor" strokeWidth="0.3" />
            <line x1={ftLineRx} y1={yKey0} x2={ftLineRx} y2={yKey0 + hKey} stroke="currentColor" strokeWidth="0.28" />
            <path
              d={`M ${rimRx + raR} ${50} A ${raR} ${raR * 0.95} 0 0 1 ${rimRx - raR} ${50}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.26"
            />
            <ellipse cx={ftLineRx} cy="50" rx={(6 / 94) * 100} ry={(6 / 50) * 100} fill="none" stroke="currentColor" strokeWidth="0.24" />

            {/* 3pt guide (approximate NBA 23′9″ arc from each hoop) */}
            <ellipse cx={rimLx} cy="50" rx={arcRx} ry={Math.min(arcRy * 0.48, 22)} fill="none" stroke="currentColor" strokeWidth="0.18" strokeDasharray="1.2 1" opacity="0.85" />
            <ellipse cx={rimRx} cy="50" rx={arcRx} ry={Math.min(arcRy * 0.48, 22)} fill="none" stroke="currentColor" strokeWidth="0.18" strokeDasharray="1.2 1" opacity="0.85" />

            {/* Hoops */}
            <circle cx={rimLx} cy="50" r="1.15" fill="#fbbf24" stroke="#78350f" strokeWidth="0.2" />
            <circle cx={rimRx} cy="50" r="1.15" fill="#fbbf24" stroke="#78350f" strokeWidth="0.2" />
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-0">
          {positioned.map(({ s, pos }) => {
            const isNew = highlightActionNumber != null && s.actionNumber === highlightActionNumber;
            return (
              <div key={s.actionNumber}>
                <div
                  className={`absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/50 ${
                    s.made ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]" : "bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.75)]"
                  }`}
                  style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  title={`${s.playerNameI ?? ""} · ${s.actionType} ${s.subType}${s.descriptor ? ` (${s.descriptor})` : ""} · ${
                    s.made ? "Made" : "Miss"
                  }${typeof s.shotDistanceFt === "number" ? ` · ${s.shotDistanceFt.toFixed(1)} ft` : ""}${s.area ? ` · ${s.area}` : ""}`}
                />
                {isNew ? (
                  <div
                    className={
                      "absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border-2 " +
                      (highlightShot?.made === false
                        ? "border-rose-200/60"
                        : "border-emerald-200/60")
                    }
                    style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
      <p className="px-3 pb-2 pt-1 text-center text-[10px] text-slate-500">
        Green = made · Red = miss · Pulse = latest shot · Only shots with NBA x/y coordinates are plotted
      </p>
    </div>
  );
}
