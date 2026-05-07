import type { GameCard, Market } from "./types";
import {
  bookPropCodeFromRundownDef,
  buildRundownMarketIdsForFetch,
  inferPickKindFromRundownDef,
  inferStatKeyFromRundownDef,
  parseRundownParticipantName,
  rundownRequestHeaders,
  type RundownMarketDef
} from "./rundownMarketIds";

export type RundownDebugState = {
  status: "idle" | "ok" | "missing_key" | "http_error" | "no_events" | "exception";
  detail?: string;
  updatedAt: string;
};

let lastRundownDebug: RundownDebugState = {
  status: "idle",
  detail: "No Rundown request yet",
  updatedAt: new Date(0).toISOString()
};

function setRundownDebug(state: Omit<RundownDebugState, "updatedAt">) {
  lastRundownDebug = { ...state, updatedAt: new Date().toISOString() };
}

export function getRundownDebugState(): RundownDebugState {
  return lastRundownDebug;
}

function todayYmdEt(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function decimalToAmerican(decimal: number): number | null {
  if (!Number.isFinite(decimal) || decimal <= 1) return null;
  if (decimal >= 2) return Math.round((decimal - 1) * 100);
  return Math.round(-100 / (decimal - 1));
}

function extractAmerican(participant: any): number | null {
  const direct = num(participant?.price) ?? num(participant?.american) ?? num(participant?.moneyline);
  if (direct != null && Math.abs(direct) >= 100) return Math.round(direct);
  const nested =
    num(participant?.odds?.american) ??
    num(participant?.odds?.us) ??
    num(participant?.odds_american) ??
    num(participant?.oddsAmerican) ??
    num(participant?.prices?.american) ??
    num(participant?.prices?.us);
  if (nested != null && Math.abs(nested) >= 100) return Math.round(nested);
  const dec =
    num(participant?.decimal) ??
    num(participant?.odds?.decimal) ??
    num(participant?.prices?.decimal) ??
    num(participant?.odds_decimal);
  if (dec != null) return decimalToAmerican(dec);
  return null;
}

function extractLinePrices(lineObj: any): Array<{ source: string; american: number; isMain: boolean }> {
  const out: Array<{ source: string; american: number; isMain: boolean }> = [];
  const prices = lineObj?.prices;
  if (!prices || typeof prices !== "object") return out;
  for (const [bookId, raw] of Object.entries(prices as Record<string, any>)) {
    const american = num((raw as any)?.price);
    if (american == null || Math.abs(american) < 100) continue;
    out.push({
      source: `rundown:${String(bookId)}`,
      american: Math.round(american),
      isMain: Boolean((raw as any)?.is_main_line)
    });
  }
  const hasMain = out.some((x) => x.isMain);
  return hasMain ? out.filter((x) => x.isMain) : out;
}

function isCoreGameLineType(t: string): boolean {
  return t === "moneyline" || t === "runline" || t === "total" || t === "team_total";
}

/** Rundown MLB prop markets are often named `hits` / `batter_*` / `pitcher_*` without the word "player". */
function looksLikeRundownPlayerPropName(name: string): boolean {
  const n = name.toLowerCase();
  if (n.includes("player")) return true;
  return (
    /\b(batter|pitcher|strike\s*out|strikeouts?|home\s*run|\bhr\b|\bhits?\b|\brbi\b|\bruns?\b|walk|stolen|singles?|doubles?|triples?|earned|outs?\s*recorded|allowed|pickoff|plate\s*appearance|\bat\s*bats?\b|\bab\b)/.test(
      n
    ) &&
    !/\b(team\s*total|spread|moneyline|money\s*line|game\s*total)\b/.test(n)
  );
}

function marketTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("moneyline") || n.includes("money line")) return "moneyline";
  if (n.includes("spread") || n.includes("run line")) return "runline";
  if (n.includes("team total")) return "team_total";
  if (n.includes("total base") || /\btotal\s*bases\b/.test(n)) return "player_prop";
  if (n.includes("total")) return "total";
  if (n.includes("player")) return "player_prop";
  if (looksLikeRundownPlayerPropName(n)) return "player_prop";
  return `rundown_${n.replace(/[^a-z0-9]+/g, "_")}`;
}

function normTeam(s: string): string {
  return s.toLowerCase().replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function teamsMatchLoose(a: string, b: string): boolean {
  const x = normTeam(a);
  const y = normTeam(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function resolveGameIdFromEvent(ev: any, games: GameCard[]): string {
  if (!games.length) return String(ev?.event_id ?? "");
  const teams: any[] = Array.isArray(ev?.teams) ? ev.teams : [];
  const away = String(teams.find((t) => t?.is_away)?.name ?? teams[0]?.name ?? "");
  const home = String(teams.find((t) => t?.is_away === false)?.name ?? teams[1]?.name ?? "");
  const match = games.find((g) => teamsMatchLoose(g.awayTeam, away) && teamsMatchLoose(g.homeTeam, home));
  return match?.id ?? String(ev?.event_id ?? "");
}

export async function fetchRundownMarketsForToday(games: GameCard[] = []): Promise<Market[]> {
  const key =
    process.env.RUNDOWN_API_KEY?.trim() ||
    process.env.THERUNDOWN_API_KEY?.trim();
  if (!key) {
    setRundownDebug({ status: "missing_key", detail: "RUNDOWN_API_KEY (or THERUNDOWN_API_KEY) missing" });
    return [];
  }

  const sportId = String(process.env.RUNDOWN_SPORT_ID ?? "3").trim();
  const date = process.env.RUNDOWN_DATE_OVERRIDE?.trim() || todayYmdEt();
  const offset = String(process.env.RUNDOWN_DATE_OFFSET_MINUTES ?? "300").trim();
  const affiliateIds = process.env.RUNDOWN_AFFILIATE_IDS?.trim();

  const { marketIdsParam, catalogPropositions, discoveredPropIds, catalog } = await buildRundownMarketIdsForFetch({
    sportId,
    dateYmd: date,
    apiKey: key
  });

  const metaByMarketId = new Map<number, RundownMarketDef>();
  for (const row of catalog) {
    metaByMarketId.set(row.id, row);
    if (row.live_variant_id != null && row.live_variant_id > 0) metaByMarketId.set(row.live_variant_id, row);
  }

  let url =
    `https://therundown.io/api/v2/sports/${encodeURIComponent(sportId)}/events/${encodeURIComponent(date)}` +
    `?market_ids=${encodeURIComponent(marketIdsParam)}&offset=${encodeURIComponent(offset)}`;
  if (affiliateIds) {
    url += `&affiliate_ids=${encodeURIComponent(affiliateIds)}`;
  }

  try {
    const res = await fetch(url, {
      headers: rundownRequestHeaders(key),
      next: { revalidate: 120 }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      setRundownDebug({ status: "http_error", detail: `${res.status} ${body.slice(0, 180)}`.trim() });
      return [];
    }
    const data = await res.json();
    const events: any[] = Array.isArray(data?.events) ? data.events : [];
    if (!events.length) {
      setRundownDebug({ status: "no_events", detail: "No events returned from Rundown" });
      return [];
    }

    const out: Market[] = [];
    let marketCount = 0;
    for (const ev of events) {
      const eventId = String(ev?.event_id ?? "");
      const mappedGameId = resolveGameIdFromEvent(ev, games);
      const markets: any[] = Array.isArray(ev?.markets) ? ev.markets : [];
      for (const mk of markets) {
        marketCount += 1;
        const mkName = String(mk?.name ?? `market_${mk?.market_id ?? "x"}`);
        const mid = Number(mk?.market_id);
        const meta = Number.isFinite(mid) ? metaByMarketId.get(mid) : undefined;
        let marketType = marketTypeFromName(mkName);
        if (!isCoreGameLineType(marketType) && meta?.proposition === true) {
          marketType = "player_prop";
        }
        const nameMeta = {
          id: Number.isFinite(mid) ? mid : 0,
          name: mkName,
          proposition: Boolean(meta?.proposition),
          short_description: meta?.short_description,
          description: meta?.description
        };
        const bookPropCode = bookPropCodeFromRundownDef(meta ?? nameMeta);
        const statKey = inferStatKeyFromRundownDef(meta ?? nameMeta);
        const pickKind = inferPickKindFromRundownDef(meta ?? nameMeta);
        const participantGroups: Array<{ source: string; rows: any[] }> = [];
        if (Array.isArray(mk?.participants)) participantGroups.push({ source: "rundown", rows: mk.participants });
        const booksA: any[] = Array.isArray(mk?.books) ? mk.books : [];
        for (const b of booksA) {
          if (Array.isArray(b?.participants)) {
            participantGroups.push({ source: String(b?.name ?? b?.book_name ?? b?.book_id ?? "rundown"), rows: b.participants });
          }
        }
        const booksB: any[] = Array.isArray(mk?.bookmakers) ? mk.bookmakers : [];
        for (const b of booksB) {
          if (Array.isArray(b?.participants)) {
            participantGroups.push({ source: String(b?.name ?? b?.key ?? "rundown"), rows: b.participants });
          }
        }
        if (!participantGroups.length) continue;

        for (const grp of participantGroups) {
          for (let i = 0; i < grp.rows.length; i++) {
            const p = grp.rows[i];
            const pname = String(p?.name ?? p?.participant_name ?? `Selection ${i + 1}`);
            const participantLines: any[] = Array.isArray(p?.lines) ? p.lines : [];
            let emitted = false;
            for (let li = 0; li < participantLines.length; li++) {
              const ln = participantLines[li];
              const lineValue = num(ln?.value) ?? num(p?.points) ?? num(p?.line) ?? null;
              const prices = extractLinePrices(ln);
              for (const pr of prices) {
                const selection = lineValue != null ? `${pname} ${lineValue > 0 ? `+${lineValue}` : lineValue}` : pname;
                const { playerName } = parseRundownParticipantName(pname);
                out.push({
                  id: `rundown-${eventId}-${String(mk?.market_id ?? mkName)}-${pr.source}-${i}-${li}`,
                  gameId: mappedGameId || eventId || `rundown-${date}`,
                  marketType,
                  selection,
                  line: lineValue,
                  american: pr.american,
                  source: pr.source,
                  playerName,
                  statKey,
                  pickKind,
                  rundownMarketId: Number.isFinite(mid) ? mid : undefined,
                  bookPropCode
                });
                emitted = true;
              }
            }
            if (!emitted) {
              const american = extractAmerican(p);
              if (american == null) continue;
              const line = num(p?.points) ?? num(p?.line) ?? null;
              const selection = line != null ? `${pname} ${line > 0 ? `+${line}` : line}` : pname;
              const { playerName } = parseRundownParticipantName(pname);
              out.push({
                id: `rundown-${eventId}-${String(mk?.market_id ?? mkName)}-${grp.source}-${i}`,
                gameId: mappedGameId || eventId || `rundown-${date}`,
                marketType,
                selection,
                line,
                american,
                source: String(grp.source).toLowerCase(),
                playerName,
                statKey,
                pickKind,
                rundownMarketId: Number.isFinite(mid) ? mid : undefined,
                bookPropCode
              });
            }
        }
        }
      }
    }
    setRundownDebug({
      status: out.length ? "ok" : "no_events",
      detail: `${out.length} priced markets across ${events.length} events / ${marketCount} markets · props catalog ${catalogPropositions} · merged ids ${marketIdsParam.split(",").length} (discovered ${discoveredPropIds.length})`
    });
    return out;
  } catch (e) {
    setRundownDebug({ status: "exception", detail: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

