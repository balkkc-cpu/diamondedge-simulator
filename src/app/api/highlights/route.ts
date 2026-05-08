import { NextResponse } from "next/server";

type HighlightClip = {
  id: string;
  gameId: string;
  matchup: string;
  status: string;
  gameTime: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  videoUrl: string;
  sourceUrl?: string;
};

const MLB_API = "https://statsapi.mlb.com/api/v1";

function ymdEt(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

function preferPlaybackUrl(playbacks: Array<{ name?: string; url?: string }>): string | null {
  if (!Array.isArray(playbacks) || !playbacks.length) return null;
  const pref = ["mp4Avc", "highBit", "FLASH_1800K_960X540", "FLASH_2500K_1280X720"];
  const ranked = [...playbacks].sort((a, b) => {
    const ia = pref.findIndex((p) => String(a.name ?? "").includes(p));
    const ib = pref.findIndex((p) => String(b.name ?? "").includes(p));
    const aa = ia === -1 ? 999 : ia;
    const bb = ib === -1 ? 999 : ib;
    return aa - bb;
  });
  const hit = ranked.find((x) => typeof x.url === "string" && x.url.startsWith("http"));
  return hit?.url ?? null;
}

async function safeJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchScheduleRows() {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dates = [ymdEt(yesterday), ymdEt(now)];
  const rows: Array<{
    id: string;
    gameDate: string;
    status: string;
    matchup: string;
  }> = [];

  for (const d of dates) {
    const data = await safeJson(`${MLB_API}/schedule?sportId=1&date=${d}`);
    const games = data?.dates?.[0]?.games ?? [];
    for (const g of games) {
      const status = String(g?.status?.abstractGameState ?? "");
      if (!/Final|Live/i.test(status)) continue;
      const away = String(g?.teams?.away?.team?.name ?? "Away");
      const home = String(g?.teams?.home?.team?.name ?? "Home");
      rows.push({
        id: String(g?.gamePk ?? ""),
        gameDate: String(g?.gameDate ?? ""),
        status,
        matchup: `${away} @ ${home}`
      });
    }
  }
  return rows.filter((x) => x.id);
}

export async function GET() {
  const games = await fetchScheduleRows();
  const cappedGames = games.slice(0, 8);
  const out: HighlightClip[] = [];

  for (const g of cappedGames) {
    const content = await safeJson(`${MLB_API}/game/${encodeURIComponent(g.id)}/content`);
    const items = content?.highlights?.highlights?.items ?? [];
    for (const it of items.slice(0, 4)) {
      const id = String(it?.id ?? `${g.id}-${out.length}`);
      const title = String(it?.headline ?? "").trim();
      const description = String(it?.blurb ?? it?.description ?? "").trim() || undefined;
      const thumb = String(it?.image?.cuts?.["320x180"]?.src ?? it?.image?.cuts?.["640x360"]?.src ?? "").trim() || undefined;
      const videoUrl = preferPlaybackUrl(it?.playbacks ?? []);
      const sourceUrl = String(it?.url ?? "").trim() || undefined;
      if (!videoUrl || !title) continue;
      out.push({
        id,
        gameId: g.id,
        matchup: g.matchup,
        status: g.status,
        gameTime: g.gameDate,
        title,
        description,
        thumbnailUrl: thumb,
        videoUrl,
        sourceUrl
      });
    }
  }

  return NextResponse.json({ clips: out.slice(0, 24) });
}

