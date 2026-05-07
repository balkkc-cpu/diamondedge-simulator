async function run() {
  const k = process.env.ODDS_API_KEY;
  if (!k) {
    console.log("NO_KEY");
    return;
  }
  const urls = [
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?apiKey=${encodeURIComponent(k)}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&bookmakers=fanduel,draftkings`,
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/odds?apiKey=${encodeURIComponent(k)}&regions=us,us2,eu,uk,au&markets=h2h,spreads,totals&oddsFormat=american`,
    `https://api.the-odds-api.com/v4/sports/upcoming/odds?apiKey=${encodeURIComponent(k)}&regions=us,us2,eu,uk,au&markets=h2h,spreads,totals&oddsFormat=american`,
    `https://api.the-odds-api.com/v4/sports/baseball_mlb/events?apiKey=${encodeURIComponent(k)}`
  ];
  for (const u of urls) {
    const r = await fetch(u);
    let t = "";
    try {
      t = await r.text();
    } catch {}
    console.log("URL", u.split("?")[0]);
    console.log("STATUS", r.status, "REM", r.headers.get("x-requests-remaining"), "USED", r.headers.get("x-requests-used"));
    console.log("BODY", t.slice(0, 260).replace(/\s+/g, " "));
  }
}

run().catch((e) => {
  console.error("probe failed", e?.message || e);
  process.exit(1);
});
