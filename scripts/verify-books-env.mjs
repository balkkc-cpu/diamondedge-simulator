/**
 * Checks that env files are set up for live sportsbook player props.
 * Does not print secret values.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const env = { ...parseEnvFile(path.join(root, ".env")), ...parseEnvFile(path.join(root, ".env.local")) };
const oddsKey = (env.ODDS_API_KEY || "").trim();
const rundownKey = (env.RUNDOWN_API_KEY || env.THERUNDOWN_API_KEY || "").trim();
const provider = (env.ODDS_PROVIDER || "").trim().toLowerCase();

console.log("DiamondEdge — live odds check\n");

if (!oddsKey) {
  console.log("ODDS_API_KEY: not set (add to .env.local)");
  console.log("  → Player props on the default board need The Odds API.");
  console.log("  → Sign up: https://the-odds-api.com/\n");
} else {
  console.log("ODDS_API_KEY: set (" + oddsKey.length + " chars)");
  try {
    const u = `https://api.the-odds-api.com/v4/sports?apiKey=${encodeURIComponent(oddsKey)}`;
    const res = await fetch(u);
    if (res.ok) {
      const j = await res.json();
      const n = Array.isArray(j) ? j.length : 0;
      console.log("  → API reachable; sports list length:", n);
      const rem = res.headers.get("x-requests-remaining");
      if (rem != null) console.log("  → x-requests-remaining:", rem);
    } else {
      const t = await res.text().catch(() => "");
      console.log("  → API error HTTP", res.status, t.slice(0, 120));
    }
  } catch (e) {
    console.log("  → Network error:", e instanceof Error ? e.message : String(e));
  }
  console.log("");
}

if (provider === "rundown") {
  if (!rundownKey) console.log("ODDS_PROVIDER=rundown but RUNDOWN_API_KEY missing — game lines from Rundown will be empty.\n");
  else console.log("RUNDOWN_API_KEY: set (" + rundownKey.length + " chars)\n");
} else {
  console.log("ODDS_PROVIDER:", provider || "(default — schedule + Odds API for props when key set)\n");
}

if (oddsKey) {
  console.log("Next: npm run dev  →  open Bet Builder; player props should show fanduel/draftkings/betmgm sources.\n");
} else {
  console.log("Next: paste ODDS_API_KEY into .env.local, then: npm run dev\n");
}

process.exit(oddsKey ? 0 : 1);
