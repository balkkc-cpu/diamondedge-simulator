"use client";

import { useState } from "react";

export default function MasterLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    setLoading(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Login failed");
      return;
    }
    window.location.href = "/admin";
  }

  return (
    <main className="mx-auto max-w-md">
      <section className="panel p-6">
        <h2 className="text-xl font-semibold text-blue-200">Master Login</h2>
        <p className="mt-1 text-xs text-slate-300">Owner-only access for payout links and private controls.</p>
        <form onSubmit={onSubmit} className="mt-4 space-y-3">
          <label className="block text-sm text-slate-300">
            Username
            <input
              className="mt-1 w-full rounded bg-slate-900 p-2"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="block text-sm text-slate-300">
            Password
            <input
              className="mt-1 w-full rounded bg-slate-900 p-2"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-negative">{error}</p> : null}
          <button disabled={loading} className="btn-primary w-full">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
