"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { SlipBet } from "@/lib/types";

type SlipRow = { id: string; name: string | null; bankroll: number; unitSize: number; updatedAt: string };
type SimRow = { id: string; title: string | null; createdAt: string };

export default function LibraryPage() {
  const [slips, setSlips] = useState<SlipRow[]>([]);
  const [sims, setSims] = useState<SimRow[]>([]);
  const [err, setErr] = useState("");
  const [me, setMe] = useState<boolean | null>(null);

  const load = useCallback(() => {
    setErr("");
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.user) {
          setMe(false);
          return;
        }
        setMe(true);
        return Promise.all([
          fetch("/api/saved-slips", { credentials: "include" }).then((x) => x.json()),
          fetch("/api/saved-simulations", { credentials: "include" }).then((x) => x.json())
        ]);
      })
      .then((pair) => {
        if (!pair) return;
        setSlips(pair[0].slips ?? []);
        setSims(pair[1].simulations ?? []);
      })
      .catch(() => setErr("Could not load library."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function loadSlipToBuilder(id: string) {
    const res = await fetch(`/api/saved-slips/${id}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error ?? "Load failed");
      return;
    }
    const bets = data.slip.bets as SlipBet[];
    sessionStorage.setItem(
      "diamondedge_load_slip",
      JSON.stringify({
        bets,
        bankroll: data.slip.bankroll,
        unitSize: data.slip.unitSize
      })
    );
    window.location.href = "/bet-builder";
  }

  async function openSimulation(id: string) {
    const res = await fetch(`/api/saved-simulations/${id}`, { credentials: "include" });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error ?? "Open failed");
      return;
    }
    sessionStorage.setItem("diamondedge_results", JSON.stringify(data.payload));
    window.location.href = "/simulation-results";
  }

  async function deleteSlip(id: string) {
    if (!confirm("Delete this saved slip?")) return;
    await fetch(`/api/saved-slips/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  async function deleteSim(id: string) {
    if (!confirm("Delete this saved simulation?")) return;
    await fetch(`/api/saved-simulations/${id}`, { method: "DELETE", credentials: "include" });
    load();
  }

  if (me === false) {
    return (
      <main className="panel mx-auto max-w-lg p-6 text-center">
        <p className="text-slate-300">Sign in to save slips and simulations.</p>
        <Link href="/login" className="btn-primary mt-4 inline-block">
          Login
        </Link>
      </main>
    );
  }

  if (me === null) {
    return (
      <main className="panel p-6">
        <p className="text-slate-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8">
      <section className="panel p-5">
        <h1 className="text-xl font-bold text-sky-300">My library</h1>
        <p className="mt-1 text-sm text-slate-400">Saved bet slips and simulation runs are private to your account.</p>
        {err ? <p className="mt-2 text-sm text-negative">{err}</p> : null}
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-100">Saved slips</h2>
        {slips.length === 0 ? <p className="mt-2 text-sm text-slate-500">None yet — save from Bet Builder.</p> : null}
        <ul className="mt-3 space-y-2">
          {slips.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 p-3 text-sm">
              <div>
                <div className="font-medium text-slate-100">{s.name || "Untitled slip"}</div>
                <div className="text-xs text-slate-500">
                  Bankroll {s.bankroll} · Unit {s.unitSize} · {new Date(s.updatedAt).toLocaleString()}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-muted text-xs" onClick={() => loadSlipToBuilder(s.id)}>
                  Load in builder
                </button>
                <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => deleteSlip(s.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="text-lg font-semibold text-slate-100">Saved simulations</h2>
        {sims.length === 0 ? <p className="mt-2 text-sm text-slate-500">None yet — save from Results after you run a sim.</p> : null}
        <ul className="mt-3 space-y-2">
          {sims.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-900 p-3 text-sm">
              <div>
                <div className="font-medium text-slate-100">{s.title || "Simulation"}</div>
                <div className="text-xs text-slate-500">{new Date(s.createdAt).toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-muted text-xs" onClick={() => openSimulation(s.id)}>
                  Open results
                </button>
                <button type="button" className="text-xs text-red-400 hover:underline" onClick={() => deleteSim(s.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
