"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Post = {
  id: string;
  caption: string | null;
  imageUrl: string | null;
  imageData: string | null;
  createdAt: string;
  author: string;
};

export default function CommunityPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/community/posts?take=24", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => setPosts(d.posts ?? []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setOk("");
    let imageData: string | null = null;
    if (file) {
      if (!file.type.startsWith("image/")) {
        setErr("Please choose a JPEG or PNG image.");
        return;
      }
      if (file.size > 320 * 1024) {
        setErr("Image too large — try under ~300KB (crop or compress).");
        return;
      }
      imageData = await new Promise<string | null>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
        r.onerror = () => reject(new Error("read failed"));
        r.readAsDataURL(file);
      }).catch(() => null);
      if (!imageData) {
        setErr("Could not read image.");
        return;
      }
    }
    const res = await fetch("/api/community/posts", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption: caption.trim() || null, imageData })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data.error ?? "Post failed");
      return;
    }
    setOk("Posted!");
    setCaption("");
    setFile(null);
    load();
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6">
      <section className="panel p-5">
        <h1 className="text-xl font-bold text-sky-300">Community wins board</h1>
        <p className="mt-2 text-sm text-slate-400">
          Share screenshots of real tickets or slips you researched with DiamondEdge — celebrate responsibly. Verified
          accounts only. No guarantees; simulation is not betting advice.
        </p>
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <textarea
            className="w-full rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-slate-100"
            rows={3}
            placeholder="Caption (ticket details, what you liked about the sim, etc.)"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
          <label className="block text-sm text-slate-300">
            Screenshot (optional, max ~300KB)
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-1 block w-full text-xs"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {err ? <p className="text-sm text-negative">{err}</p> : null}
          {ok ? <p className="text-sm text-positive">{ok}</p> : null}
          <button type="submit" className="btn-primary">
            Post
          </button>
        </form>
        <p className="mt-2 text-[11px] text-slate-500">
          Not verified?{" "}
          <Link href="/signup" className="text-sky-400 underline">
            Sign up
          </Link>{" "}
          and click the email link first.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-200">Recent posts</h2>
        {loading ? <p className="text-slate-500">Loading…</p> : null}
        {!loading && posts.length === 0 ? <p className="text-slate-500">No posts yet — be the first.</p> : null}
        {posts.map((p) => (
          <article key={p.id} className="panel overflow-hidden p-4">
            <div className="mb-2 flex justify-between text-xs text-slate-500">
              <span className="font-medium text-slate-300">{p.author}</span>
              <time dateTime={p.createdAt}>{new Date(p.createdAt).toLocaleString()}</time>
            </div>
            {p.caption ? <p className="whitespace-pre-wrap text-sm text-slate-200">{p.caption}</p> : null}
            {p.imageData || p.imageUrl ? (
              <div className="relative mt-3 max-h-[480px] overflow-hidden rounded-lg border border-slate-700">
                {p.imageData ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageData} alt="" className="max-h-[480px] w-full object-contain" />
                ) : p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="max-h-[480px] w-full object-contain" />
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
