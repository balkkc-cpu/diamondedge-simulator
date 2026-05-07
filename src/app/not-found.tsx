import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-sky-300">Page not found</h1>
      <p className="mt-3 text-sm text-slate-400">That route does not exist or was moved.</p>
      <Link href="/" className="btn-primary mt-6 inline-block">
        Back to dashboard
      </Link>
    </main>
  );
}
