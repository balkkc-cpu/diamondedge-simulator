"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Me = { id: string; email: string; displayName: string | null; emailVerified: boolean } | null;

const links: [string, string][] = [
  ["/", "Dashboard"],
  ["/nba", "NBA"],
  ["/bet-builder", "Bet Builder"],
  ["/simulation-results", "Results"],
  ["/live-tracker", "Live MLB"],
  ["/live-tracker?sport=nba", "Live NBA"],
  ["/community", "Wins board"],
  ["/library", "My library"],
  ["/upgrade", "Plus"],
  ["/settings", "Settings"]
];

export function SiteNav() {
  const [me, setMe] = useState<Me | undefined>(undefined);

  const refresh = useCallback(() => {
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setMe(null);
    window.location.href = "/";
  }

  return (
    <nav className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap gap-2 text-sm">
        {links.map(([href, label]) => (
          <Link key={href} href={href} className="btn-muted">
            {label}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-700/50 pt-3 text-sm lg:border-0 lg:pt-0">
        {me === undefined ? (
          <span className="text-slate-500">…</span>
        ) : me ? (
          <>
            <span className="max-w-[200px] truncate text-xs text-slate-400" title={me.email}>
              {me.email}
            </span>
            <button type="button" className="btn-muted" onClick={logout}>
              Log out
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="btn-muted">
              Login
            </Link>
            <Link href="/signup" className="btn-primary">
              Sign up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
