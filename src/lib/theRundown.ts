import { isPlayerPropMarketType } from "./odds";
import { HITTER_MATRIX, PITCHER_MATRIX, type PickKind, type StatKey } from "./playerPropCatalog";
import { playerPropSelectionLooksStatBased } from "./rosterProps";
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
  if (direct != null && direct > 1 && direct < 50) {
    const fromDec = decimalToAmerican(direct);
    if (fromDec != null) return fromDec;
  }
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

/** The Rundown sometimes stores US odds in `price`, sometimes decimal odds, and 0.0001 = off the board. */
function americanFromLinePriceRaw(raw: any): number | null {
  const p0 = num((raw as any)?.price);
  if (p0 != null && p0 > 0 && p0 < 0.01) return null;
  const direct =
    num((raw as any)?.price) ??
    num((raw as any)?.american) ??
    num((raw as any)?.odds?.american) ??
    num((raw as any)?.odds?.us);
  if (direct != null && Number.isFinite(direct)) {
    const a = Math.round(direct);
    if (Math.abs(a) >= 100) return a;
  }
  const dec =
    num((raw as any)?.decimal) ??
    num((raw as any)?.odds?.decimal) ??
    (p0 != null && p0 > 1 && p0 < 50 ? p0 : null);
  if (dec != null && dec > 1) {
    const am = decimalToAmerican(dec);
    if (am != null && Math.abs(am) >= 1) return am;
  }
  return null;
}

function extractLinePrices(lineObj: any): Array<{ source: string; american: number; isMain: boolean }> {
  const out: Array<{ source: string; american: number; isMain: boolean }> = [];
  const prices = lineObj?.prices;
  if (!prices || typeof prices !== "object") return out;
  for (const [bookId, raw] of Object.entries(prices as Record<string, any>)) {
    const american = americanFromLinePriceRaw(raw);
    if (american == null) continue;
    out.push({
      source: `rundown:${String(bookId)}`,
      american: Math.round(american),
      isMain: Boolean((raw as any)?.is_main_line)
    });
  }
  const hasMain = out.some((x) => x.isMain);
  if (!hasMain) return out;
  const mains = out.filter((x) => x.isMain);
  return mains.length ? mains : out;
}

function isCoreGameLineType(t: string): boolean {
  return t === "moneyline" || t === "runline" || t === "total" || t === "team_total";
}

/** Rundown MLB prop markets are often named `hits` / `batter_*` / `pitcher_*` without the word "player". */
function looksLikeRundownPlayerPropName(name: string): boolean {
  const n = name.toLowerCase();
  if (/\b(team\s*total|spread|moneyline|money\s*line|game\s*total|run\s*line|runline|handicap|puck\s*line|alternate)\b/.test(n)) {
    return false;
  }
  if (n.includes("player")) return true;
  return (
    /\b(batter|pitcher|strike\s*out|strikeouts?|home\s*run|\bhr\b|\bhits\b|\brbis?\b|\bwalks\b|stolen|singles?|doubles?|triples?|earned|outs?\s*recorded|allowed|pickoff|plate\s*appearance|\bat\s*bats?\b|\bab\b)/.test(
      n
    ) ||
    /\b(runs\s+scored|player\s+runs|total\s*bases|\btb\b)\b/.test(n)
  );
}

function marketTypeFromName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("moneyline") || n.includes("money line")) return "moneyline";
  if (/\b(alternate\s+)?(spread|handicap|run\s*line|puck\s*line)\b/.test(n) || n.includes("runline")) return "runline";
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
  const match =
    games.find((g) => teamsMatchLoose(g.awayTeam, away) && teamsMatchLoose(g.homeTeam, home)) ??
    games.find((g) => teamsMatchLoose(g.awayTeam, home) && teamsMatchLoose(g.homeTeam, away));
  return match?.id ?? String(ev?.event_id ?? "");
}

function ouSideFromFeedExtras(p: any, ln: any): "over" | "under" | undefined {
  const blob = [ln?.name, ln?.description, ln?.outcome_type, ln?.side, ln?.over_under, p?.outcome_type, p?.side, p?.over_under]
    .map((x) => String(x ?? "").toLowerCase())
    .join(" ");
  if (/\bover\b|\bhigh\b|\bmore\b/.test(blob)) return "over";
  if (/\bunder\b|\blow\b|\bless\b/.test(blob)) return "under";
  return undefined;
}

/** When the participant label is only "Over"/"Under", the player often appears at the start of the market title. */
function tryLeadingPlayerFromPropMarketName(mkName: string): string | undefined {
  const s = mkName.replace(/\s+/g, " ").trim();
  if (!s) return undefined;
  const head = s.split(/\s*[-–—]\s*/)[0]!.split(/\s*\(/)[0]!.trim();
  const words = head.split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words.length <= 6) {
    const joined = words.join(" ");
    if (!/^(batter|pitcher|player|team|game|total|alternate|strike|mlb)\b/i.test(joined)) return joined;
  }
  return undefined;
}

function statLabelFor(stat: StatKey): string {
  if (stat === "k") return PITCHER_MATRIX.k.label;
  return HITTER_MATRIX[stat as Exclude<StatKey, "k">].label;
}

/**
 * Normalize free-feed player props so roster filtering, UI legibility, and the synthetic Odds layout
 * all see stable rows (`Name · Over 0.5 Hits`, HR Yes/No, `N+ Hits`).
 */
function shapeRundownPlayerPropRow(row: Market, mkName: string, participantRaw: string, p: any, ln: any): Market {
  if (row.marketType !== "player_prop" || !row.statKey) return row;
  const stat = row.statKey;
  const mt = `player_${stat}`;
  let pickKind: PickKind = (row.pickKind ?? "over_under") as PickKind;
  const kindBlob = `${mkName} ${participantRaw}`.toLowerCase();
  if (/\d\s*\+/.test(kindBlob) && pickKind !== "yes_no") pickKind = "tier_plus";

  const { playerName: parsedPn, side: sideFromParticipant } = parseRundownParticipantName(participantRaw);
  const pr = participantRaw.trim();
  let pn =
    (row.playerName && row.playerName.split(/\s+/).filter(Boolean).length >= 2 ? row.playerName : parsedPn)?.trim() ?? "";

  if ((!pn || pn.split(/\s+/).length < 2) && /^(over|under)$/i.test(pr)) {
    const fromMk = tryLeadingPlayerFromPropMarketName(mkName);
    if (fromMk) pn = fromMk;
  }

  const feedSide = sideFromParticipant ?? ouSideFromFeedExtras(p, ln);

  if (stat === "hr" && pickKind === "yes_no") {
    if (/\(yes\)|\(no\)/i.test(row.selection) && /\bhome\s*run|\bhomer\b|\bhr\b/i.test(row.selection)) {
      return { ...row, marketType: mt, playerName: pn || row.playerName };
    }
    let isYes: boolean | null = /^yes\b/i.test(pr) ? true : /^no\b/i.test(pr) ? false : null;
    if (isYes == null) {
      if (/\(yes\)/i.test(row.selection)) isYes = true;
      else if (/\(no\)/i.test(row.selection)) isYes = false;
    }
    if (pn.split(/\s+/).length < 2) {
      const fromMk = tryLeadingPlayerFromPropMarketName(mkName);
      if (fromMk) pn = fromMk;
    }
    if (pn.split(/\s+/).length >= 2 && isYes != null) {
      return {
        ...row,
        marketType: mt,
        pickKind: "yes_no",
        line: null,
        playerName: pn,
        selection: `${pn} · To hit a home run (${isYes ? "Yes" : "No"})`
      };
    }
  }

  if (pickKind === "tier_plus" && row.line != null && Number.isFinite(Number(row.line))) {
    const n = Math.round(Number(row.line));
    if (!playerPropSelectionLooksStatBased(row.selection) && pn.split(/\s+/).length >= 2) {
      return {
        ...row,
        marketType: mt,
        pickKind: "tier_plus",
        playerName: pn,
        line: n,
        selection: `${pn} · ${n}+ ${statLabelFor(stat)}`,
        tierMin: row.tierMin ?? n
      };
    }
    return { ...row, marketType: mt, pickKind: "tier_plus", playerName: pn || row.playerName };
  }

  if (pickKind === "over_under" && row.line != null && Number.isFinite(Number(row.line))) {
    const lineN = Number(row.line);
    if (playerPropSelectionLooksStatBased(row.selection) && row.selection.includes("·")) {
      return { ...row, marketType: mt, playerName: pn || row.playerName, line: lineN };
    }
    const sideEff =
      feedSide ??
      (/\bover\b/i.test(row.selection) ? ("over" as const) : /\bunder\b/i.test(row.selection) ? ("under" as const) : undefined);
    if (pn.split(/\s+/).length >= 2 && sideEff) {
      return {
        ...row,
        marketType: mt,
        pickKind: "over_under",
        playerName: pn,
        line: lineN,
        selection: `${pn} · ${sideEff === "over" ? "Over" : "Under"} ${lineN} ${statLabelFor(stat)}`
      };
    }
  }

  return row.statKey ? { ...row, marketType: mt, playerName: pn || row.playerName } : row;
}

function ingestRundownEvents(
  events: any[],
  games: GameCard[],
  metaByMarketId: Map<number, RundownMarketDef>,
  date: string
): Market[] {
  const out: Market[] = [];
  for (const ev of events) {
    const eventId = String(ev?.event_id ?? "");
    const mappedGameId = resolveGameIdFromEvent(ev, games);
    const markets: any[] = Array.isArray(ev?.markets) ? ev.markets : [];
    for (const mk of markets) {
      const mkName = String(mk?.name ?? `market_${mk?.market_id ?? "x"}`);
      const mid = Number(mk?.market_id);
      const meta = Number.isFinite(mid) ? metaByMarketId.get(mid) : undefined;
      let marketType = marketTypeFromName(mkName);
      if (!isCoreGameLineType(marketType) && looksLikeRundownPlayerPropName(mkName)) {
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
          participantGroups.push({
            source: String(b?.name ?? b?.book_name ?? b?.book_id ?? "rundown"),
            rows: b.participants
          });
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
          let participantLines: any[] = Array.isArray(p?.lines) ? [...p.lines] : [];
          if (
            !participantLines.length &&
            p?.prices &&
            typeof p.prices === "object" &&
            Object.keys(p.prices).length > 0
          ) {
            participantLines.push({
              value: num(p?.points) ?? num(p?.line) ?? num(p?.value),
              prices: p.prices
            });
          }
          let emitted = false;
          for (let li = 0; li < participantLines.length; li++) {
            const ln = participantLines[li];
            const lineValue = num(ln?.value) ?? num(p?.points) ?? num(p?.line) ?? null;
            const prices = extractLinePrices(ln);
            for (const pr of prices) {
              const selection = lineValue != null ? `${pname} ${lineValue > 0 ? `+${lineValue}` : lineValue}` : pname;
              const { playerName } = parseRundownParticipantName(pname);
              const raw: Market = {
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
              };
              out.push(marketType === "player_prop" ? shapeRundownPlayerPropRow(raw, mkName, pname, p, ln) : raw);
              emitted = true;
            }
          }
          if (!emitted) {
            const american = extractAmerican(p);
            if (american == null) continue;
            const line = num(p?.points) ?? num(p?.line) ?? null;
            const selection = line != null ? `${pname} ${line > 0 ? `+${line}` : line}` : pname;
            const { playerName } = parseRundownParticipantName(pname);
            const raw: Market = {
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
            };
            out.push(marketType === "player_prop" ? shapeRundownPlayerPropRow(raw, mkName, pname, p, null) : raw);
          }
        }
      }
    }
  }
  return out;
}

async function fetchRundownEventsPage(
  sportId: string,
  date: string,
  offset: string,
  marketIdsParam: string,
  key: string,
  affiliateIds?: string
): Promise<{ ok: boolean; events: any[]; status: number }> {
  let url =
    `https://therundown.io/api/v2/sports/${encodeURIComponent(sportId)}/events/${encodeURIComponent(date)}` +
    `?market_ids=${encodeURIComponent(marketIdsParam)}&offset=${encodeURIComponent(offset)}`;
  if (affiliateIds) {
    url += `&affiliate_ids=${encodeURIComponent(affiliateIds)}`;
  }
  const res = await fetch(url, {
    headers: rundownRequestHeaders(key),
    next: { revalidate: 120 }
  });
  if (!res.ok) return { ok: false, events: [], status: res.status };
  try {
    const data = await res.json();
    const events: any[] = Array.isArray(data?.events) ? data.events : [];
    return { ok: true, events, status: res.status };
  } catch {
    return { ok: false, events: [], status: res.status };
  }
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

  const { marketIdsParam, catalogPropositions, discoveredPropIds, catalog, catalogHttpStatus } =
    await buildRundownMarketIdsForFetch({
      sportId,
      dateYmd: date,
      apiKey: key
    });

  const metaByMarketId = new Map<number, RundownMarketDef>();
  for (const row of catalog) {
    metaByMarketId.set(row.id, row);
    if (row.live_variant_id != null && row.live_variant_id > 0) metaByMarketId.set(row.live_variant_id, row);
  }

  try {
    const primary = await fetchRundownEventsPage(sportId, date, offset, marketIdsParam, key, affiliateIds);
    if (!primary.ok) {
      setRundownDebug({
        status: "http_error",
        detail: `${primary.status} events fetch (primary market_ids batch)`
      });
      return [];
    }
    if (!primary.events.length) {
      setRundownDebug({ status: "no_events", detail: "No events returned from Rundown" });
      return [];
    }

    let out = ingestRundownEvents(primary.events, games, metaByMarketId, date);

    const propRowsNow = () => out.filter((m) => isPlayerPropMarketType(m.marketType));

    if (propRowsNow().length === 0 && affiliateIds) {
      const bare = await fetchRundownEventsPage(sportId, date, offset, marketIdsParam, key, undefined);
      if (bare.ok && bare.events.length) {
        const alt = ingestRundownEvents(bare.events, games, metaByMarketId, date);
        const altProps = alt.filter((m) => isPlayerPropMarketType(m.marketType));
        if (altProps.length > propRowsNow().length) out = alt;
      }
    }
    const BATCH = Math.min(16, Math.max(8, Number(process.env.RUNDOWN_PROP_MARKET_ID_BATCH ?? "12") || 12));
    const MAX_BATCHES = Math.min(10, Math.max(2, Number(process.env.RUNDOWN_PROP_FETCH_BATCHES ?? "8") || 8));

    if (propRowsNow().length === 0 && discoveredPropIds.length > 0) {
      const dedupe = new Map<string, Market>();
      for (const m of out) dedupe.set(m.id, m);
      const core = [1, 2, 3];
      let batches = 0;
      for (let s = 0; s < discoveredPropIds.length && batches < MAX_BATCHES; s += BATCH) {
        const chunk = discoveredPropIds.slice(s, s + BATCH);
        const param = [...new Set([...core, ...chunk])].sort((a, b) => a - b).join(",");
        const page = await fetchRundownEventsPage(sportId, date, offset, param, key, affiliateIds);
        batches += 1;
        if (!page.ok || !page.events.length) continue;
        const more = ingestRundownEvents(page.events, games, metaByMarketId, date);
        for (const m of more) dedupe.set(m.id, m);
        out = [...dedupe.values()];
        if (propRowsNow().length > 0) break;
      }
    }

    const propRows = out.filter((m) => isPlayerPropMarketType(m.marketType));
    setRundownDebug({
      status: out.length ? "ok" : "no_events",
      detail: `${out.length} priced rows · ${propRows.length} player-prop rows · ${primary.events.length} events (primary) · catalog http ${catalogHttpStatus} · proposition defs ${catalogPropositions} · merged market_ids ${marketIdsParam.split(",").length} (discovered prop ids ${discoveredPropIds.length})`
    });
    return out;
  } catch (e) {
    setRundownDebug({ status: "exception", detail: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

