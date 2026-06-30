import * as Location from "expo-location";
import { Point } from "@/types/models";

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** Fallback coordinate (Monterey, CA — near our first mock course). */
const FALLBACK: Coordinate = { latitude: 36.5681, longitude: -121.9486 };

/**
 * Get the device location. On web / when permission is denied / on any error we
 * gracefully fall back to a mock coordinate so the app keeps working.
 *
 * REAL GPS: this already uses expo-location on native. No change needed; just
 * ensure location permissions are granted on device.
 */
export async function getCurrentPosition(): Promise<{ coordinate: Coordinate; isMock: boolean }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return { coordinate: FALLBACK, isMock: true };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return {
      coordinate: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
      isMock: false,
    };
  } catch {
    return { coordinate: FALLBACK, isMock: true };
  }
}

/**
 * Convert two normalized canvas points into an approximate yardage. Used by the
 * rangefinder when working with mock geometry instead of real lat/lng.
 *
 * REAL GPS: replace this with a haversine distance between two `Coordinate`s.
 */
export function pointsToYards(a: Point, b: Point, holeLengthYards: number): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const normalized = Math.sqrt(dx * dx + dy * dy);
  // The full canvas height (~0.8 units tee->green) maps to the hole length.
  return Math.round((normalized / 0.78) * holeLengthYards);
}
