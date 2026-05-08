"use client";

import { useEffect, useState } from "react";
import { formatDateTimeEastern } from "@/lib/timeDisplay";

type HighlightClip = {
  id: string;
  gameId: string;
  matchup: string;
  status: string;
  gameTime: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  sourceUrl?: string;
};

export function DashboardHighlights() {
  const [clips, setClips] = useState<HighlightClip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/highlights");
        const data = await res.json();
        if (!cancelled) setClips(Array.isArray(data?.clips) ? data.clips : []);
      } catch {
        if (!cancelled) setClips([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const t = window.setInterval(load, 300_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  return (
    <section className="panel p-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-slate-100">Recent Game Highlights</h3>
        <p className="text-xs text-slate-400">
          One recap video per game from yesterday and earlier today.
        </p>
      </div>

      {loading ? <p className="text-sm text-slate-400">Loading highlights…</p> : null}
      {!loading && !clips.length ? <p className="text-sm text-slate-400">No highlight clips available right now.</p> : null}

      <div className="grid gap-3 md:grid-cols-2">
        {clips.map((c) => (
          <article key={c.id} className="rounded-lg border border-slate-700/70 bg-slate-950/50 p-3">
            <p className="text-xs text-sky-300">{c.matchup}</p>
            <p className="mt-1 text-sm font-medium text-slate-100">{c.title}</p>
            {c.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-400">{c.description}</p> : null}
            <video
              className="mt-2 w-full rounded-md border border-slate-700/60 bg-black"
              controls
              preload="none"
              poster={c.thumbnailUrl}
              src={c.videoUrl}
            />
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {formatDateTimeEastern(c.gameTime)} · {c.status}
              </span>
              {c.sourceUrl ? (
                <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">
                  Source
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

