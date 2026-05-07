"use client";

import { useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [state, setState] = useState<"pending" | "success" | "error">("pending");
  const [message, setMessage] = useState("Verifying...");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setState("error");
      setMessage("Missing verification token.");
      return;
    }
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token })
    }).then(async (res) => {
      if (res.ok) {
        setState("success");
        setMessage("Email verified. Redirecting to app...");
        setTimeout(() => (window.location.href = "/"), 1200);
      } else {
        const data = await res.json().catch(() => ({}));
        setState("error");
        setMessage(data.error ?? "Verification failed.");
      }
    });
  }, []);

  return (
    <main className="mx-auto max-w-md">
      <section className="panel p-6">
        <h2 className="text-xl font-semibold text-blue-200">Email Verification</h2>
        <p className={state === "error" ? "mt-3 text-negative" : "mt-3 text-slate-300"}>{message}</p>
      </section>
    </main>
  );
}
