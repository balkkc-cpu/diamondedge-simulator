import { Course, GeoPoint, Green, Hazard, Hole, LayupZone, TeeBox } from "@/types/models";
import { centroid, lerpGeo, milesBetween, projectToCanvas, yardsBetween } from "./geo";

/**
 * Real golf-course data from OpenStreetMap via the Overpass API.
 *
 * Free and keyless. OSM coverage varies: many courses have a `leisure=golf_course`
 * polygon and `golf=hole/green/tee/bunker` features, but some only have a name and
 * outline. We degrade gracefully — if hole geometry is missing the caller falls
 * back to a synthesized layout so the app still works.
 *
 * Course id format: `osm-<type>-<id>` (e.g. `osm-way-12345`).
 */

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

async function overpass(query: string, timeoutMs = 20000): Promise<OverpassElement[]> {
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      return (json.elements ?? []) as OverpassElement[];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("Overpass request failed");
}

function elementCenter(el: OverpassElement): GeoPoint | null {
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  if (el.lat !== undefined && el.lon !== undefined) return { lat: el.lat, lng: el.lon };
  if (el.geometry && el.geometry.length) {
    return centroid(el.geometry.map((g) => ({ lat: g.lat, lng: g.lon })));
  }
  return null;
}

/** Find real golf courses near a coordinate. Returns lightweight stubs (no holes yet). */
export async function getOsmNearbyCourses(center: GeoPoint, radiusM = 30000): Promise<Course[]> {
  const q = `[out:json][timeout:20];
(
  way["leisure"="golf_course"](around:${radiusM},${center.lat},${center.lng});
  relation["leisure"="golf_course"](around:${radiusM},${center.lat},${center.lng});
);
out center tags;`;

  const els = await overpass(q);
  const courses: Course[] = [];
  for (const el of els) {
    const geo = elementCenter(el);
    if (!geo) continue;
    const name = el.tags?.name ?? "Unnamed golf course";
    courses.push({
      id: `osm-${el.type}-${el.id}`,
      name,
      city: el.tags?.["addr:city"] ?? "",
      state: el.tags?.["addr:state"] ?? "",
      par: el.tags?.par ? Number(el.tags.par) : 72,
      distanceMiles: milesBetween(center, geo),
      holes: [],
      isMock: false,
      geo,
      source: "osm",
    });
  }
  // De-dupe by name+rough location and sort by distance.
  const seen = new Set<string>();
  return courses
    .filter((c) => {
      const key = `${c.name}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999))
    .slice(0, 20);
}

const TEE_PRESETS = [
  { id: "back", name: "Back", color: "#111111", factor: 1 },
  { id: "middle", name: "Middle", color: "#2E6E96", factor: 0.86 },
  { id: "forward", name: "Forward", color: "#D1453B", factor: 0.7 },
];

function buildTees(teeGeo: GeoPoint, greenGeo: GeoPoint, lengthYards: number): TeeBox[] {
  return TEE_PRESETS.map((p) => {
    // Forward tees sit further down the fairway toward the green.
    const t = 1 - p.factor;
    const geo = lerpGeo(teeGeo, greenGeo, t * 0.9);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      yards: Math.round((lengthYards * p.factor) / 5) * 5,
      position: projectToCanvas(teeGeo, greenGeo, geo),
      geo,
    };
  });
}

/**
 * Fetch real hole/green/hazard geometry for a course and assemble `Hole`s.
 * Returns the holes (possibly empty if OSM lacks per-hole data).
 */
export async function fetchOsmHoles(center: GeoPoint, radiusM = 1400): Promise<Hole[]> {
  const q = `[out:json][timeout:25];
(
  way["golf"="hole"](around:${radiusM},${center.lat},${center.lng});
  way["golf"="green"](around:${radiusM},${center.lat},${center.lng});
  node["golf"="green"](around:${radiusM},${center.lat},${center.lng});
  way["golf"="bunker"](around:${radiusM},${center.lat},${center.lng});
  way["golf"="lateral_water_hazard"](around:${radiusM},${center.lat},${center.lng});
  way["golf"="water_hazard"](around:${radiusM},${center.lat},${center.lng});
);
out geom;`;

  const els = await overpass(q);

  const greens: GeoPoint[] = [];
  const bunkers: GeoPoint[] = [];
  const waters: GeoPoint[] = [];
  const holeEls: OverpassElement[] = [];

  for (const el of els) {
    const g = el.tags?.golf;
    if (g === "hole" && el.geometry && el.geometry.length >= 2) {
      holeEls.push(el);
    } else if (g === "green") {
      const c = elementCenter(el);
      if (c) greens.push(c);
    } else if (g === "bunker") {
      const c = elementCenter(el);
      if (c) bunkers.push(c);
    } else if (g === "water_hazard" || g === "lateral_water_hazard") {
      const c = elementCenter(el);
      if (c) waters.push(c);
    }
  }

  const nearest = (p: GeoPoint, list: GeoPoint[], maxM: number): GeoPoint | null => {
    let best: GeoPoint | null = null;
    let bestD = maxM;
    for (const q of list) {
      const d = yardsBetween(p, q) * 0.9144;
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  };

  const holes: Hole[] = [];
  for (const el of holeEls) {
    const geom = el.geometry!.map((g) => ({ lat: g.lat, lng: g.lon }));
    const teeGeo = geom[0];
    const endGeo = geom[geom.length - 1];
    const greenGeo = nearest(endGeo, greens, 60) ?? endGeo;
    const distTag = el.tags?.dist ? Number(el.tags.dist) : 0;
    const lenY = distTag > 60 ? distTag : yardsBetween(teeGeo, greenGeo);
    if (lenY < 60) continue; // skip degenerate

    const parTag = el.tags?.par ? Number(el.tags.par) : undefined;
    const par = (parTag === 3 || parTag === 4 || parTag === 5
      ? parTag
      : lenY > 470
        ? 5
        : lenY < 240
          ? 3
          : 4) as 3 | 4 | 5;
    const refNum = el.tags?.ref ? Number(el.tags.ref) : undefined;

    const tees = buildTees(teeGeo, greenGeo, lenY);

    const green: Green = {
      frontYards: lenY - 16,
      middleYards: lenY,
      backYards: lenY + 15,
      center: projectToCanvas(teeGeo, greenGeo, greenGeo),
      front: projectToCanvas(teeGeo, greenGeo, lerpGeo(teeGeo, greenGeo, 0.97)),
      back: projectToCanvas(teeGeo, greenGeo, lerpGeo(greenGeo, endGeo, 0.05)),
      centerGeo: greenGeo,
      frontGeo: lerpGeo(teeGeo, greenGeo, 0.97),
      backGeo: greenGeo,
    };

    // Assign nearby hazards to this hole (within ~45m of the tee->green line midpoint band).
    const mid = lerpGeo(teeGeo, greenGeo, 0.5);
    const hazards: Hazard[] = [];
    const collect = (list: GeoPoint[], kind: "bunker" | "water", label: string) => {
      for (const h of list) {
        const dToLine = Math.min(
          yardsBetween(h, teeGeo),
          yardsBetween(h, greenGeo),
          yardsBetween(h, mid),
        );
        if (dToLine * 0.9144 < 55) {
          hazards.push({
            id: `${el.id}-${kind}-${hazards.length}`,
            kind,
            label,
            carryYards: yardsBetween(teeGeo, h),
            position: projectToCanvas(teeGeo, greenGeo, h),
            geo: h,
          });
        }
      }
    };
    collect(bunkers, "bunker", "Bunker");
    collect(waters, "water", "Water hazard");

    const layups: LayupZone[] = [];
    if (par === 5) {
      const lp = lerpGeo(teeGeo, greenGeo, Math.max(0, (lenY - 100) / lenY));
      layups.push({ id: `${el.id}-lay`, label: "Layup to 100 in", yards: lenY - 100, position: projectToCanvas(teeGeo, greenGeo, lp) });
    }

    holes.push({
      number: refNum && refNum >= 1 && refNum <= 18 ? refNum : holes.length + 1,
      par,
      handicapIndex: el.tags?.handicap ? Number(el.tags.handicap) : ((holes.length * 7) % 18) + 1,
      shape: `Par ${par}`,
      tees,
      green,
      hazards: hazards.slice(0, 6),
      layups,
      dogleg: undefined,
    });
  }

  // Order by hole number and de-dupe numbers.
  holes.sort((a, b) => a.number - b.number);
  const used = new Set<number>();
  let next = 1;
  for (const h of holes) {
    if (used.has(h.number)) {
      while (used.has(next)) next++;
      h.number = next;
    }
    used.add(h.number);
  }
  return holes.slice(0, 18);
}
