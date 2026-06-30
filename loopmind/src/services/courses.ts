import { Course } from "@/types/models";
import { findCourse, getMockCourses } from "@/data/mockCourses";
import { getCurrentPosition } from "./location";

/**
 * Course discovery service.
 *
 * REAL COURSE DATA: swap the mock implementations below for a live provider.
 * Suggested shape:
 *   - getNearbyCourses(): use GPS + a course API (e.g. a course-mapping
 *     provider) and map results into `Course`.
 *   - searchCourses(query): hit the provider's search endpoint.
 *   - getCourseById(id): fetch full hole/tee/hazard geometry on demand.
 * Keep returning `Course` objects and the UI requires no changes.
 */

export async function getNearbyCourses(): Promise<{ courses: Course[]; usedMock: boolean }> {
  const { isMock } = await getCurrentPosition();
  // Mock provider returns the built-in courses sorted by their mock distance.
  const courses = [...getMockCourses()].sort(
    (a, b) => (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999),
  );
  return { courses, usedMock: isMock || courses.every((c) => c.isMock) };
}

export function searchCourses(query: string): Course[] {
  const q = query.trim().toLowerCase();
  const all = getMockCourses();
  if (!q) return all;
  return all.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q),
  );
}

export function getCourseById(id: string): Course | undefined {
  return findCourse(id);
}
