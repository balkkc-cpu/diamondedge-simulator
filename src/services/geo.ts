import { GeoPoint } from "@/types/models";

const EARTH_RADIUS_M = 6371000;
const METERS_PER_YARD = 0.9144;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in meters. */
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance between two coordinates, rounded to whole yards. */
export function yardsBetween(a: GeoPoint, b: GeoPoint): number {
  return Math.round(haversineMeters(a, b) / METERS_PER_YARD);
}

export function metersToYards(m: number): number {
  return Math.round(m / METERS_PER_YARD);
}

export function milesBetween(a: GeoPoint, b: GeoPoint): number {
  return Math.round((haversineMeters(a, b) / 1609.34) * 10) / 10;
}

/** Initial bearing from a -> b in degrees (0 = north, clockwise). */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

/** Interpolate a point `t` (0..1) of the way from a to b (linear; fine at hole scale). */
export function lerpGeo(a: GeoPoint, b: GeoPoint, t: number): GeoPoint {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Centroid of a list of coordinates. */
export function centroid(points: GeoPoint[]): GeoPoint {
  const n = points.length || 1;
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / n, lng: sum.lng / n };
}

/**
 * Project a real-world point onto the normalized 0..1 hole canvas used by the
 * SVG renderer, given the tee and green positions (tee at bottom, green at top).
 */
export function projectToCanvas(tee: GeoPoint, green: GeoPoint, p: GeoPoint): { x: number; y: number } {
  const holeLenM = Math.max(1, haversineMeters(tee, green));
  const forward = toRad(bearing(tee, green));
  const d = haversineMeters(tee, p);
  const brng = toRad(bearing(tee, p));
  const along = d * Math.cos(brng - forward);
  const cross = d * Math.sin(brng - forward);
  const y = 0.9 - (along / holeLenM) * 0.78;
  const x = 0.5 + (cross / holeLenM) * 0.62;
  return { x: Math.max(0.04, Math.min(0.96, x)), y: Math.max(0.06, Math.min(0.94, y)) };
}
