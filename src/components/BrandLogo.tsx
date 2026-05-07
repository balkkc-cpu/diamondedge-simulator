export function BrandLogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const text = size === "lg" ? "text-2xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <div className="flex items-center gap-3">
      <svg className={s + " shrink-0 drop-shadow-[0_0_12px_rgba(96,165,250,0.45)]"} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <defs>
          <linearGradient id="deG" x1="0" y1="0" x2="48" y2="48">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <path
          d="M24 4L44 24L24 44L4 24L24 4Z"
          stroke="url(#deG)"
          strokeWidth="2"
          fill="rgba(17,26,46,0.9)"
        />
        <path d="M24 14L32 24L24 34L16 24L24 14Z" fill="url(#deG)" opacity="0.85" />
      </svg>
      <div>
        <div className={"font-black tracking-tight " + text + " bg-gradient-to-r from-sky-300 via-indigo-300 to-violet-300 bg-clip-text text-transparent"}>
          DiamondEdge
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Simulator</div>
      </div>
    </div>
  );
}
