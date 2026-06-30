import { Course, Green, Hazard, Hole, LayupZone, Point, TeeBox } from "@/types/models";

/**
 * Built-in mock courses for the MVP.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * REAL COURSE DATA: replace `getMockCourses()` / `findCourse()` usage with a
 * real provider (e.g. a USGA/course-mapping API) in `src/services/courses.ts`.
 * Keep returning the same `Course` shape and the rest of the app keeps working.
 * Normalized coordinates (0..1) are used so the SVG HoleMap renders without a
 * real basemap; swap HoleMap for Mapbox/Google later using lat/lng instead.
 * ──────────────────────────────────────────────────────────────────────────
 */

const TEE_PRESETS: Omit<TeeBox, "yards" | "position">[] = [
  { id: "black", name: "Championship", color: "#111111" },
  { id: "blue", name: "Blue", color: "#2E6E96" },
  { id: "white", name: "White", color: "#E2E8E2" },
  { id: "gold", name: "Gold (Senior)", color: "#C9A227" },
  { id: "red", name: "Red (Forward)", color: "#D1453B" },
];

function buildTees(maxYards: number): TeeBox[] {
  // Spread tee lengths from the back tee down to a forward tee.
  const factors = [1, 0.93, 0.85, 0.76, 0.66];
  return TEE_PRESETS.map((preset, i) => ({
    ...preset,
    yards: Math.round((maxYards * factors[i]) / 5) * 5,
    // Back tees sit lowest on the canvas; forward tees a touch higher.
    position: { x: 0.5, y: 0.9 - i * 0.012 },
  }));
}

function buildGreen(maxYards: number, center: Point): Green {
  return {
    frontYards: maxYards - 16,
    middleYards: maxYards,
    backYards: maxYards + 15,
    center,
    front: { x: center.x, y: center.y + 0.05 },
    back: { x: center.x, y: center.y - 0.05 },
  };
}

interface HoleSpec {
  number: number;
  par: 3 | 4 | 5;
  handicapIndex: number;
  maxYards: number;
  shape?: string;
  dogleg?: Point;
  greenCenter: Point;
  hazards: Hazard[];
  layups: LayupZone[];
}

function makeHole(spec: HoleSpec): Hole {
  return {
    number: spec.number,
    par: spec.par,
    handicapIndex: spec.handicapIndex,
    shape: spec.shape,
    tees: buildTees(spec.maxYards),
    green: buildGreen(spec.maxYards, spec.greenCenter),
    hazards: spec.hazards,
    layups: spec.layups,
    dogleg: spec.dogleg,
  };
}

function water(id: string, label: string, carryYards: number, position: Point): Hazard {
  return { id, kind: "water", label, carryYards, position };
}
function bunker(id: string, label: string, carryYards: number, position: Point): Hazard {
  return { id, kind: "bunker", label, carryYards, position };
}
function layup(id: string, label: string, yards: number, position: Point): LayupZone {
  return { id, label, yards, position };
}

/**
 * Deterministic hole generator so each course has a full, varied 18 without
 * hand-authoring every coordinate. Pars follow a realistic par-72 rotation.
 */
function generateHoles(seed: number): Hole[] {
  const parPattern: (3 | 4 | 5)[] = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4];
  const yardsByPar: Record<3 | 4 | 5, number> = { 3: 175, 4: 410, 5: 545 };

  return parPattern.map((par, i) => {
    const number = i + 1;
    const wobble = ((seed * 37 + number * 53) % 60) - 30; // ±30 yds variety
    const maxYards = yardsByPar[par] + wobble;
    const doglegSide = (seed + number) % 3; // 0 straight, 1 left, 2 right
    const greenX = doglegSide === 0 ? 0.5 : doglegSide === 1 ? 0.36 : 0.64;
    const greenCenter: Point = { x: greenX, y: 0.12 };

    const hazards: Hazard[] = [];
    const layups: LayupZone[] = [];

    if (par >= 4) {
      hazards.push(
        bunker(`h${number}-fb`, "Fairway bunker", Math.round(maxYards * 0.55), {
          x: greenX > 0.5 ? 0.4 : 0.6,
          y: 0.55,
        }),
      );
    }
    if (par === 5 || (par === 4 && number % 2 === 0)) {
      hazards.push(
        water(`h${number}-w`, "Water short-right of green", maxYards - 35, {
          x: greenX + 0.12,
          y: 0.22,
        }),
      );
      layups.push(layup(`h${number}-lay`, "Layup to 100 in", maxYards - 100, { x: greenX, y: 0.34 }));
    }
    hazards.push(
      bunker(`h${number}-gb`, "Greenside bunker", maxYards - 8, { x: greenX - 0.1, y: 0.16 }),
    );

    const dogleg: Point | undefined =
      doglegSide === 0 ? undefined : { x: doglegSide === 1 ? 0.34 : 0.66, y: 0.5 };

    return makeHole({
      number,
      par,
      handicapIndex: ((number * 7 + seed) % 18) + 1,
      maxYards,
      shape:
        doglegSide === 0
          ? par === 3
            ? "Straightaway par 3"
            : "Straightaway"
          : doglegSide === 1
            ? "Dogleg left"
            : "Dogleg right",
      dogleg,
      greenCenter,
      hazards,
      layups,
    });
  });
}

function sumPar(holes: Hole[]): number {
  return holes.reduce((acc, h) => acc + h.par, 0);
}

const pebbleHoles = generateHoles(3);
const pineHoles = generateHoles(7);
const harborHoles = generateHoles(11);

export const MOCK_COURSES: Course[] = [
  {
    id: "mock-emerald-links",
    name: "Emerald Links",
    city: "Monterey",
    state: "CA",
    par: sumPar(pebbleHoles),
    distanceMiles: 1.4,
    holes: pebbleHoles,
    isMock: true,
  },
  {
    id: "mock-pinehurst-9",
    name: "Pine Ridge National",
    city: "Pinehurst",
    state: "NC",
    par: sumPar(pineHoles),
    distanceMiles: 4.2,
    holes: pineHoles,
    isMock: true,
  },
  {
    id: "mock-harbor-town",
    name: "Harbor Town Dunes",
    city: "Hilton Head",
    state: "SC",
    par: sumPar(harborHoles),
    distanceMiles: 7.8,
    holes: harborHoles,
    isMock: true,
  },
];

export function getMockCourses(): Course[] {
  return MOCK_COURSES;
}

export function findCourse(id: string): Course | undefined {
  return MOCK_COURSES.find((c) => c.id === id);
}
