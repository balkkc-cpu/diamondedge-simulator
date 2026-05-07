import { isAdminSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function envValue(v?: string) {
  return v && v.trim() ? v : "Not configured";
}

export default function AdminPage() {
  if (!isAdminSession()) redirect("/master-login");

  return (
    <main className="grid gap-4">
      <section className="panel p-4">
        <h2 className="text-xl font-semibold text-blue-200">Owner Admin Console</h2>
        <p className="text-sm text-slate-300">
          Configure only your own payout links and private app controls. This app never handles card data directly.
        </p>
      </section>

      <section className="panel p-4 text-sm">
        <h3 className="font-semibold">Current Donation Targets (from environment)</h3>
        <p className="mt-2">PayPal: {envValue(process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL)}</p>
        <p>Venmo: {envValue(process.env.NEXT_PUBLIC_VENMO_DONATION_URL)}</p>
        <p>Card Checkout: {envValue(process.env.NEXT_PUBLIC_CARD_DONATION_URL)}</p>
        <p className="mt-2 text-xs text-slate-400">
          These should point to your own accounts only. Use PayPal.me, Venmo profile/payment link, and Stripe Payment Link.
        </p>
      </section>
    </main>
  );
}
