"use client";

import Link from "next/link";
import { useState } from "react";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [devLink, setDevLink] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setDevLink("");
    let res: Response;
    try {
      res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password })
      });
    } catch {
      setErr("Network error — is the dev server running?");
      return;
    }
    const rawBody = await res.text();
    let data: Record<string, unknown> = {};
    try {
      data = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      const preview = rawBody.replace(/\s+/g, " ").slice(0, 200);
      const hint =
        res.status >= 500
          ? " Often this is a server crash or HTML error page — check Vercel logs and DATABASE_URL."
          : "";
      setErr(
        `Server returned status ${res.status} with non-JSON body.${hint}` +
          (preview ? ` First bytes: ${preview}` : "")
      );
      return;
    }
    if (!res.ok) {
      let line = String(data.error ?? "Signup failed");
      if (typeof data.prismaCode === "string" && data.prismaCode) {
        line += ` (${data.prismaCode})`;
      }
      if (typeof data.debugMessage === "string" && data.debugMessage) {
        line += ` — ${data.debugMessage}`;
      }
      setErr(line);
      return;
    }
    if (data.loggedIn) {
      setMsg(String(data.message ?? "You’re signed in. Redirecting…"));
      window.setTimeout(() => {
        window.location.href = "/";
      }, 600);
      return;
    }
    setMsg(String(data.message ?? "Account created."));
    if (typeof data.devVerifyUrl === "string") setDevLink(data.devVerifyUrl);
    if (data.mailError && !data.emailSent) {
      setErr((prev) => (prev ? `${prev} ` : "") + String(data.mailError));
    }
  }

  return (
    <main className="mx-auto max-w-md">
      <section className="panel p-6">
        <h2 className="text-xl font-semibold text-blue-200">Create account</h2>
        <p className="mt-1 text-sm text-slate-300">
          Pick email + password. If the server has email (Resend) configured, you&apos;ll get a verify link; otherwise
          you&apos;ll be signed in right away.
        </p>
        <ul className="mt-2 list-inside list-disc text-[11px] text-slate-500">
          <li>
            Needs a real database URL: <code className="text-slate-400">DATABASE_URL</code> and run{" "}
            <code className="text-slate-400">npx prisma db push</code> once.
          </li>
          <li>
            Optional email: <code className="text-slate-400">RESEND_API_KEY</code> + verified{" "}
            <code className="text-slate-400">RESEND_FROM_EMAIL</code> + <code className="text-slate-400">NEXT_PUBLIC_BASE_URL</code>.
          </li>
        </ul>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <input
            className="w-full rounded bg-slate-900 p-2"
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="w-full rounded bg-slate-900 p-2"
            type="password"
            placeholder="Password (8+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {err ? <p className="text-sm text-negative">{err}</p> : null}
          {msg ? <p className="text-sm text-positive">{msg}</p> : null}
          {devLink ? (
            <div className="rounded-lg border border-amber-700/50 bg-amber-950/30 p-3 text-xs text-amber-100">
              <p className="font-semibold text-amber-200">Dev / no-email link (do not share)</p>
              <a className="mt-1 block break-all text-sky-300 underline" href={devLink}>
                {devLink}
              </a>
            </div>
          ) : null}
          <button className="btn-primary w-full" type="submit">
            Create account
          </button>
        </form>
        <p className="mt-3 text-sm text-slate-300">
          Already have an account?{" "}
          <Link className="text-blue-300 underline" href="/login">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
