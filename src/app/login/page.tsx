"use client";

import Link from "next/link";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) {
      setErr(data.error ?? "Login failed");
      return;
    }
    window.location.href = "/";
  }

  return (
    <main className="mx-auto max-w-md">
      <section className="panel p-6">
        <h2 className="text-xl font-semibold text-blue-200">Login</h2>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            className="w-full rounded bg-slate-900 p-2"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="w-full rounded bg-slate-900 p-2"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {err ? <p className="text-sm text-negative">{err}</p> : null}
          <button className="btn-primary w-full">Login</button>
        </form>
        <p className="mt-3 text-sm text-slate-300">
          Need account?{" "}
          <Link className="text-blue-300 underline" href="/signup">
            Sign up
          </Link>
        </p>
      </section>
    </main>
  );
}
