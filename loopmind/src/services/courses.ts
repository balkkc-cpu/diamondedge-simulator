import { Course, GeoPoint } from "@/types/models";
import { findCourse, getMockCourses } from "@/data/mockCourses";
import { getCurrentPosition } from "./location";
import { fetchOsmHoles, getOsmNearbyCourses } from "./osmCourses";

/**
 * Course discovery.
 *
 * Two sources, unified behind the `Course` model:
 *   - OSM (OpenStreetMap / Overpass) — real courses + layouts near the user's GPS.
 *   - Mock — three built-in sample courses, always available as a fallback.
 *
 * A small in-memory registry lets screens resolve a course by id synchronously
 * after it's been discovered. (Registry is per-session; mock courses are always
 * resolvable, OSM courses after they've been listed/opened.)
 */

const registry = new Map<string, Course>();

// Seed the registry with the always-available mock courses.
for (const c of getMockCourses()) registry.set(c.id, c);

export function registerCourse(course: Course): void {
  const existing = registry.get(course.id);
  // Don't clobber an already-loaded layout with an emptier stub.
  if (existing && existing.holes.length > 0 && course.holes.length === 0) return;
  registry.set(course.id, course);
}

export function getCourseById(id: string): Course | undefined {
  return registry.get(id) ?? findCourse(id);
}

export interface NearbyResult {
  /** Real courses found via OSM near the user (may be empty). */
  real: Course[];
  /** Built-in sample courses. */
  samples: Course[];
  /** True if we could not use real GPS (so "near you" is approximate). */
  usedMockLocation: boolean;
  /** Set if the OSM lookup failed (offline / rate-limited). */
  osmError?: string;
}

export async function getNearbyCourses(): Promise<NearbyResult> {
  const { coordinate, isMock } = await getCurrentPosition();
  const center: GeoPoint = { lat: coordinate.latitude, lng: coordinate.longitude };

  const samples = [...getMockCourses()].sort(
    (a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999),
  );

  let real: Course[] = [];
  let osmError: string | undefined;
  try {
    real = await getOsmNearbyCourses(center);
    for (const c of real) registerCourse(c);
  } catch (e) {
    osmError = e instanceof Error ? e.message : "Could not reach OpenStreetMap.";
  }

  return { real, samples, usedMockLocation: isMock, osmError };
}

export function searchCourses(query: string): Course[] {
  const q = query.trim().toLowerCase();
  const all = [...registry.values()];
  if (!q) return all;
  return all.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q),
  );
}

/**
 * Ensure a course has its hole layout loaded. Mock courses already do; OSM
 * courses fetch their geometry on demand. Returns the (possibly updated) course.
 */
export async function ensureCourseLayout(id: string): Promise<Course | undefined> {
  const course = getCourseById(id);
  if (!course) return undefined;
  if (course.holes.length > 0) return course;
  if (course.source === "osm" && course.geo) {
    const holes = await fetchOsmHoles(course.geo);
    const updated: Course = {
      ...course,
      holes,
      par: holes.length ? holes.reduce((a, h) => a + h.par, 0) : course.par,
    };
    registry.set(id, updated);
    return updated;
  }
  return course;
}
