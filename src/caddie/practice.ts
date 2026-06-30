import { Round } from "@/types/models";
import { summarizeRound } from "@/store/useRoundStore";

export type PracticeArea = "tee" | "approach" | "chipping" | "putting" | "penalties";

export interface WeaknessResult {
  area: PracticeArea;
  /** Rough "lost strokes per round" estimate vs a solid baseline. */
  lostStrokes: number;
  message: string;
}

export interface PracticeBreakdown {
  area: PracticeArea;
  label: string;
  lostStrokes: number;
}

export interface PracticePlanItem {
  area: PracticeArea;
  title: string;
  drill: string;
  minutesPerWeek: number;
}

const AREA_LABEL: Record<PracticeArea, string> = {
  tee: "Tee shots",
  approach: "Approach play",
  chipping: "Chipping",
  putting: "Putting",
  penalties: "Course management",
};

const DRILLS: Record<PracticeArea, { title: string; drill: string }> = {
  tee: {
    title: "Find more fairways",
    drill: "Hit 20 drives to a 30-yard-wide 'fairway'. Club down to 3-wood when 2+ in a row miss.",
  },
  approach: {
    title: "Dial in your wedges",
    drill: "From 60/80/100 yds, hit 10 balls each to a target. Note your true carry numbers.",
  },
  chipping: {
    title: "Up-and-down ladder",
    drill: "9 chips from 3 lies; goal is inside the flagstick length. Two up-and-downs to 'win'.",
  },
  putting: {
    title: "Eliminate 3-putts",
    drill: "Lag drill: putt to a 3-ft circle from 30/40/50 ft. Then make 25 straight 4-footers.",
  },
  penalties: {
    title: "Smarter targets",
    drill: "Play 9 holes taking only the safe option off the tee and to the fat of greens.",
  },
};

export interface PracticeAnalysis {
  hasData: boolean;
  topWeakness: WeaknessResult;
  breakdown: PracticeBreakdown[];
  plan: PracticePlanItem[];
}

/**
 * Estimate lost strokes per area from tracked rounds and build a weekly plan.
 * Baselines approximate a solid ~10 handicap; deltas above baseline = lost shots.
 */
export function analyzeRounds(rounds: Round[]): PracticeAnalysis {
  if (rounds.length === 0) {
    return {
      hasData: false,
      topWeakness: {
        area: "putting",
        lostStrokes: 0,
        message: "Play and track a round and I'll pinpoint exactly where you're leaking shots.",
      },
      breakdown: [],
      plan: [DRILLS.putting].map((d) => ({ area: "putting", ...d, minutesPerWeek: 60 })),
    };
  }

  const totals = rounds.map(summarizeRound);
  const n = totals.length;
  const avg = (sel: (s: ReturnType<typeof summarizeRound>) => number) =>
    totals.reduce((a, s) => a + sel(s), 0) / n;

  const puttsPerRound = avg((s) => s.putts);
  const penaltiesPerRound = avg((s) => s.penalties);
  const fairwayPct = avg((s) => (s.fairwayChances ? s.fairwaysHit / s.fairwayChances : 0.5));
  const girPct = avg((s) => (s.holes ? s.gir / s.holes : 0));

  // Lost-stroke estimates (clamped at 0).
  const lost: Record<PracticeArea, number> = {
    putting: Math.max(0, puttsPerRound - 32) * 0.7,
    penalties: penaltiesPerRound * 1.0,
    tee: Math.max(0, 0.5 - fairwayPct) * 8,
    approach: Math.max(0, 0.5 - girPct) * 7,
    chipping: Math.max(0, 0.45 - girPct) * 3,
  };

  const breakdown: PracticeBreakdown[] = (Object.keys(lost) as PracticeArea[])
    .map((area) => ({ area, label: AREA_LABEL[area], lostStrokes: Math.round(lost[area] * 10) / 10 }))
    .sort((a, b) => b.lostStrokes - a.lostStrokes);

  const top = breakdown[0];
  const topWeakness: WeaknessResult = {
    area: top.area,
    lostStrokes: top.lostStrokes,
    message:
      top.lostStrokes <= 0.2
        ? "Your game is well-rounded — keep sharpening your strengths and stay patient out there."
        : `You're losing about ${top.lostStrokes} shots a round to ${AREA_LABEL[top.area].toLowerCase()}. That's your fastest path to lower scores.`,
  };

  // Plan: top 3 weaknesses get more time.
  const plan: PracticePlanItem[] = breakdown.slice(0, 3).map((b, i) => ({
    area: b.area,
    title: DRILLS[b.area].title,
    drill: DRILLS[b.area].drill,
    minutesPerWeek: [90, 60, 45][i] ?? 30,
  }));

  return { hasData: true, topWeakness, breakdown, plan };
}
