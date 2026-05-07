import type { PickKind, StatKey } from "./playerPropCatalog";

/** https://docs.therundown.io/authentication — prefer header over query `key`. */
export const RUNDOWN_AUTH_HEADER = "X-TheRundown-Key";

export function rundownRequestHeaders(apiKey: string): HeadersInit {
  return { [RUNDOWN_AUTH_HEADER]: apiKey };
}

export type RundownMarketDef = {
  id: number;
  name: string;
  proposition: boolean;
  short_description?: string;
  description?: string;
  line_value_is_participant?: boolean;
  live_variant_id?: number | null;
};

/**
 * Retail / feed-style snake_case codes (similar keys many sportsbooks use in APIs and exports).
 * Values are stable labels; numeric `market_id` still comes from The Rundown catalog.
 */
export const BOOK_STYLE_PROP_CODE_BY_PATTERN: Array<{ code: string; test: (s: string) => boolean }> = [
  { code: "batter_home_runs", test: (s) => /\bhome\s*run|\bhr\b|homer/.test(s) && !/h\+r|hits\+runs|r \+ h/.test(s) },
  { code: "batter_hits", test: (s) => /\bhit\b/.test(s) && !/h\+r|hits\+runs|runs\+hits/.test(s) },
  { code: "batter_total_bases", test: (s) => /\btotal\s*bases|\btb\b/.test(s) && !/hits\+runs/.test(s) },
  { code: "batter_rbis", test: (s) => /\brbi\b/.test(s) },
  { code: "batter_runs_scored", test: (s) => /\bruns?\s*scored\b|\bruns\b/.test(s) && !/hits|rbi|strike|pitch/.test(s) },
  { code: "batter_stolen_bases", test: (s) => /\bstolen|\bsb\b/.test(s) },
  { code: "batter_walks", test: (s) => /\bwalks?\b|\bbb\b/.test(s) && !/pitcher/.test(s) },
  { code: "pitcher_strikeouts", test: (s) => /\bstrike\s*out|strikeouts?|\bks?\b/.test(s) },
  { code: "pitcher_outs", test: (s) => /\bouts?\s*recorded\b|\bpitcher\s*outs\b/.test(s) },
  { code: "pitcher_earned_runs", test: (s) => /\bearned\s+runs?|\ber\b/.test(s) && /pitch/.test(s) },
  { code: "pitcher_hits_allowed", test: (s) => /\bhits?\s*allowed\b/.test(s) },
  { code: "combined_runs_hits_rbis", test: (s) => /hits\s*\+\s*runs\s*\+\s*rbi|h\+r\+rbi|hrr/.test(s) },
  { code: "batter_singles", test: (s) => /\bsingles?\b/.test(s) },
  { code: "batter_doubles", test: (s) => /\bdoubles?\b/.test(s) },
  { code: "batter_triples", test: (s) => /\btriples?\b/.test(s) },
  { code: "player_points", test: (s) => /\bpoints?\b/.test(s) && /player|basket/.test(s) },
  { code: "player_assists", test: (s) => /\bassists?\b/.test(s) },
  { code: "player_rebounds", test: (s) => /\brebounds?\b/.test(s) },
  { code: "player_threes", test: (s) => /\bthree|3pt|3-pt|\b3s\b/.test(s) }
];

function normRundownText(name: string, shortDesc?: string, description?: string): string {
  return `${name} ${shortDesc ?? ""} ${description ?? ""}`
    .toLowerCase()
    .replace(/[_-]+/g, " ");
}

/** Best-effort retail slug: prefers snake_case `name` from API when already in that form, else pattern match. */
export function bookPropCodeFromRundownDef(m: Pick<RundownMarketDef, "name" | "short_description" | "description">): string {
  const rawName = String(m.name ?? "").trim();
  if (/^[a-z][a-z0-9_]*$/.test(rawName)) return rawName;
  const blob = normRundownText(rawName, m.short_description, m.description);
  for (const { code, test } of BOOK_STYLE_PROP_CODE_BY_PATTERN) {
    if (test(blob)) return code;
  }
  return rawName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64) || "player_prop";
}

export function inferStatKeyFromRundownDef(m: Pick<RundownMarketDef, "name" | "short_description" | "description">): StatKey | undefined {
  const blob = normRundownText(m.name, m.short_description, m.description);
  if (/\bdouble\s*double|\btriple\s*double\b/i.test(blob)) return undefined;
  if (/h\+r|hits\s*\+\s*runs\s*\+\s*rbi|r \+ h|combined/.test(blob)) return "hrr";
  if (/\bhome\s*run|\bhr\b|homer/.test(blob)) return "hr";
  if (/\bhit\b/.test(blob) && !/allowed/.test(blob)) return "hits";
  if (/\btotal\s*bases|\btb\b/.test(blob)) return "tb";
  if (/\brbi\b/.test(blob)) return "rbi";
  if (/\brun\b/.test(blob) && !/earned|pitch/.test(blob)) return "runs";
  if (/\bwalks?\b|\bbb\b/.test(blob) && !/pitcher/.test(blob)) return "walks";
  if (/\bstrike|^\s*k\s|pitcher.*k\b|\bks\b|strikeouts?/.test(blob)) return "k";
  return undefined;
}

export function inferPickKindFromRundownDef(m: Pick<RundownMarketDef, "name" | "short_description" | "description">): PickKind | undefined {
  const blob = normRundownText(m.name, m.short_description, m.description);
  if (/\bdouble\s*double|\btriple\s*double\b|to\s*record|yes|no\b/.test(blob)) return "yes_no";
  return "over_under";
}

export function parseRundownParticipantName(participantName: string): { playerName?: string; side?: "over" | "under" } {
  let s = participantName.trim();
  let side: "over" | "under" | undefined;
  if (/\bOver\b/i.test(s)) {
    side = "over";
    s = s.replace(/\bOver\b/i, "").trim();
  } else if (/\bUnder\b/i.test(s)) {
    side = "under";
    s = s.replace(/\bUnder\b/i, "").trim();
  }
  const playerName = s.replace(/\s+/g, " ").trim();
  return { playerName: playerName || undefined, side };
}

function parseIdList(raw: string | undefined): number[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function uniqueSorted(nums: number[]): number[] {
  return [...new Set(nums)].sort((a, b) => a - b);
}

/** GET /api/v2/sports/{sport}/markets/{date} — market definitions with `proposition` flags. */
export async function fetchRundownMarketsCatalogForSportDate(
  sportId: string,
  dateYmd: string,
  apiKey: string
): Promise<{ defs: RundownMarketDef[]; httpStatus: number }> {
  const offset = String(process.env.RUNDOWN_DATE_OFFSET_MINUTES ?? "300").trim();
  const url =
    `https://therundown.io/api/v2/sports/${encodeURIComponent(sportId)}/markets/${encodeURIComponent(dateYmd)}` +
    `?offset=${encodeURIComponent(offset)}`;

  const res = await fetch(url, {
    headers: rundownRequestHeaders(apiKey),
    next: { revalidate: 600 }
  });
  if (!res.ok) return { defs: [], httpStatus: res.status };
  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { defs: [], httpStatus: res.status };
  }

  let arr: any[] = Array.isArray(data[String(sportId)]) ? (data[String(sportId)] as any[]) : [];
  if (!arr.length && data && typeof data === "object") {
    const first = Object.values(data).find((v) => Array.isArray(v) && (v as any[]).length > 0);
    if (first) arr = first as any[];
  }
  const out: RundownMarketDef[] = [];
  for (const row of arr) {
    const id = Number((row as any)?.id);
    if (!Number.isFinite(id)) continue;
    out.push({
      id,
      name: String((row as any)?.name ?? ""),
      proposition: Boolean((row as any)?.proposition),
      short_description: (row as any)?.short_description != null ? String((row as any).short_description) : undefined,
      description: (row as any)?.description != null ? String((row as any).description) : undefined,
      line_value_is_participant: (row as any)?.line_value_is_participant as boolean | undefined,
      live_variant_id:
        (row as any)?.live_variant_id != null && Number.isFinite(Number((row as any).live_variant_id))
          ? Number((row as any).live_variant_id)
          : null
    });
  }
  return { defs: out, httpStatus: res.status };
}

/**
 * Builds `market_ids` for the events endpoint: core (ML/RN/OU/…) plus all proposition markets
 * The Rundown reports as active for that date (sport-specific — no invented IDs).
 */
export async function buildRundownMarketIdsForFetch(params: {
  sportId: string;
  dateYmd: string;
  apiKey: string;
}): Promise<{
  marketIdsParam: string;
  discoveredPropIds: number[];
  catalogPropositions: number;
  catalog: RundownMarketDef[];
  catalogHttpStatus: number;
}> {
  const discover = String(process.env.RUNDOWN_DISCOVER_PROP_MARKET_IDS ?? "true").toLowerCase() !== "false";
  const maxIds = Math.min(80, Math.max(12, Number(process.env.RUNDOWN_MAX_MARKET_IDS ?? "72") || 72));

  const envBase = process.env.RUNDOWN_MARKET_IDS?.trim();
  const baseIds = uniqueSorted(parseIdList(envBase && envBase.length > 0 ? envBase : "1,2,3"));

  let propIds: number[] = [];
  let catalogCount = 0;
  let catalog: RundownMarketDef[] = [];
  let catalogHttpStatus = 0;

  /** When `proposition` is false on catalog rows, still treat obvious stat markets as props (some keys/plans omit the flag). */
  function catalogRowLooksLikePlayerProp(m: RundownMarketDef): boolean {
    if (m.proposition) return true;
    const blob = normRundownText(m.name, m.short_description, m.description);
    if (/\b(moneyline|spread|run line|total|team total)\b/i.test(blob)) return false;
    return /\b(batter|pitcher|player|strikeout|strike\s*out|home\s*run|\bhr\b|\bhits?\b|\brbi\b|\bruns\b|walk|stolen|single|double|triple|outs|allowed|pickoff|plate appearance|\bat\s*bats?\b|\bab\b|to\s*record|double\s*double|triple\s*double)/i.test(
      blob
    );
  }

  if (discover) {
    const { defs, httpStatus } = await fetchRundownMarketsCatalogForSportDate(params.sportId, params.dateYmd, params.apiKey);
    catalogHttpStatus = httpStatus;
    catalog = defs;
    const propositions = catalog.filter(catalogRowLooksLikePlayerProp);
    catalogCount = propositions.length;
    const expanded = new Set<number>();
    for (const m of propositions) {
      expanded.add(m.id);
      if (m.live_variant_id != null && m.live_variant_id > 0) expanded.add(m.live_variant_id);
    }
    propIds = uniqueSorted([...expanded]);
  }

  const extra = parseIdList(process.env.RUNDOWN_EXTRA_MARKET_IDS);
  /** Always request core sides first, then discovered props (so long RUNDOWN_MARKET_IDS lists cannot crowd props out). */
  const MIN_CORE = [1, 2, 3];
  const baseExtras = baseIds.filter((id) => !MIN_CORE.includes(id));
  const prioritized: number[] = [];
  const pushCap = (id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    if (prioritized.length >= maxIds) return;
    if (!prioritized.includes(id)) prioritized.push(id);
  };
  for (const id of MIN_CORE) pushCap(id);
  for (const id of propIds) pushCap(id);
  for (const id of baseExtras) pushCap(id);
  for (const id of extra) pushCap(id);

  return {
    marketIdsParam: prioritized.join(","),
    discoveredPropIds: propIds,
    catalogPropositions: catalogCount,
    catalog,
    catalogHttpStatus
  };
}
