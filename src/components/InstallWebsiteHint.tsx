"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "diamondedge_install_hint_dismissed_v2";

function looksMobile() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 768px)").matches || "ontouchstart" in window;
}

export function InstallWebsiteHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      if (!looksMobile()) return;
      setShow(true);
    } catch {
      setShow(looksMobile());
    }
  }, []);

  function dismiss() {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="mb-4 rounded-xl border border-sky-800/50 bg-slate-900/90 px-4 py-3 text-sm text-slate-200 shadow-lg shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sky-200">You’re already in the right place</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            DiamondEdge runs in your browser — <strong className="text-slate-300">no extra “viewer” app</strong> and no
            App Store download required. Optional: add this page to your home screen for a full-screen shortcut (same
            website, just an icon).
          </p>
          <ul className="mt-2 list-inside list-disc text-[11px] text-slate-500">
            <li>
              <strong className="text-slate-400">iPhone (Safari):</strong> Share → Add to Home Screen
            </li>
            <li>
              <strong className="text-slate-400">Android (Chrome):</strong> ⋮ menu → Install app or Add to Home screen
            </li>
          </ul>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg bg-slate-800 px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
