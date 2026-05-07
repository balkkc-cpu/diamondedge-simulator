export function DonationCard() {
  const paypal =
    process.env.NEXT_PUBLIC_PAYPAL_DONATION_URL ||
    "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=lecture423%40gmail.com&currency_code=USD";
  const venmo = process.env.NEXT_PUBLIC_VENMO_DONATION_URL || "https://venmo.com/lecture423";
  const card = process.env.NEXT_PUBLIC_CARD_DONATION_URL;

  return (
    <section className="panel p-4">
      <h3 className="text-lg font-semibold text-blue-200">Support the Creator</h3>
      <p className="mb-3 text-sm text-slate-300">
        Optional support only. Funds go directly to creator payment pages configured by the owner.
      </p>
      <div className="flex flex-wrap gap-2">
        {paypal ? (
          <a className="btn-primary" href={paypal} target="_blank" rel="noreferrer noopener">
            Donate via PayPal
          </a>
        ) : null}
        {venmo ? (
          <a className="btn-muted" href={venmo} target="_blank" rel="noreferrer noopener">
            Donate via Venmo
          </a>
        ) : null}
        {card ? (
          <a className="btn-muted" href={card} target="_blank" rel="noreferrer noopener">
            Donate via Card
          </a>
        ) : null}
      </div>
      {!card ? (
        <p className="mt-2 text-xs text-slate-400">Owner has not configured donation links yet.</p>
      ) : null}
    </section>
  );
}
