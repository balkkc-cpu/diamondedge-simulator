import type { Market } from "@/lib/types";

/** Deterministic PRNG for repeatable but varied parlay draws (Mulberry32). */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(parts: string[]): number {
  let h = 2166136261;
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      h ^= p.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 10;
  }
  return h >>> 0;
}

export function shuffleInPlace<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Picks legs with different games/players/prop types when the pool allows.
 * Relaxes constraints if the pool cannot satisfy `legs`.
 */
export function pickDiverseParlayMarkets(
  pool: Market[],
  legs: number,
  rng: () => number,
  opts?: { excludeIds?: Set<string> }
): Market[] {
  const exclude = opts?.excludeIds ?? new Set<string>();
  const usable = pool.filter((m) => !exclude.has(m.id));
  if (!usable.length || legs <= 0) return [];

  const shuffled = shuffleInPlace([...usable], rng);
  const out: Market[] = [];
  const hasPlayer = (m: Market) => Boolean((m.playerName ?? "").trim());

  const takePass = (relaxGame: boolean, relaxPlayer: boolean) => {
    for (const m of shuffled) {
      if (out.length >= legs) break;
      if (out.some((x) => x.id === m.id)) continue;
      if (
        !relaxPlayer &&
        hasPlayer(m) &&
        out.some((x) => (x.playerName ?? "").toLowerCase() === (m.playerName ?? "").toLowerCase())
      ) {
        continue;
      }
      if (!relaxGame && out.some((x) => x.gameId === m.gameId)) continue;
      out.push(m);
    }
  };

  const takePropKindSpread = () => {
    const usedTypes = new Set<string>();
    for (const m of shuffled) {
      if (out.length >= legs) break;
      if (out.some((x) => x.id === m.id)) continue;
      const pn = (m.playerName ?? "").toLowerCase();
      if (pn && out.some((x) => (x.playerName ?? "").toLowerCase() === pn)) continue;
      if (out.some((x) => x.gameId === m.gameId)) continue;
      if (usedTypes.has(m.marketType)) continue;
      usedTypes.add(m.marketType);
      out.push(m);
    }
  };

  takePropKindSpread();
  if (out.length < legs) takePass(false, false);
  if (out.length < legs) takePass(true, false);
  if (out.length < legs) takePass(true, true);

  for (const m of shuffled) {
    if (out.length >= legs) break;
    if (!out.some((x) => x.id === m.id)) out.push(m);
  }

  return out.slice(0, legs);
}

export function slipSignatureFromMarketIds(ids: string[]): string {
  return [...ids].sort().join("|");
}

/** Take a consecutive window into `arr`, rotated by `seed`, for varied slices without losing pool size. */
export function rotateTake<T>(arr: T[], take: number, seed: number): T[] {
  if (arr.length <= take) return [...arr];
  const maxStart = arr.length - take;
  const start = Math.abs(seed) % (maxStart + 1);
  return arr.slice(start, start + take);
}
