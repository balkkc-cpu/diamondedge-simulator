import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Course, HoleScore, Round } from "@/types/models";

interface RoundState {
  activeRound: Round | null;
  rounds: Round[];
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  startRound: (course: Course, teeId: string) => void;
  updateHoleScore: (holeNumber: number, patch: Partial<HoleScore>) => void;
  finishRound: () => Round | null;
  discardRound: () => void;
}

function blankHoleScores(course: Course): HoleScore[] {
  return course.holes.map((h) => ({
    holeNumber: h.number,
    par: h.par,
    strokes: h.par,
    putts: 2,
    chips: 0,
    penalties: 0,
    fairwayHit: h.par === 3 ? null : false,
    greenInRegulation: false,
  }));
}

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useRoundStore = create<RoundState>()(
  persist(
    (set, get) => ({
      activeRound: null,
      rounds: [],
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      startRound: (course, teeId) =>
        set({
          activeRound: {
            id: uid(),
            courseId: course.id,
            courseName: course.name,
            teeId,
            startedAt: new Date().toISOString(),
            holeScores: blankHoleScores(course),
          },
        }),

      updateHoleScore: (holeNumber, patch) =>
        set((s) => {
          if (!s.activeRound) return s;
          return {
            activeRound: {
              ...s.activeRound,
              holeScores: s.activeRound.holeScores.map((hs) =>
                hs.holeNumber === holeNumber ? { ...hs, ...patch } : hs,
              ),
            },
          };
        }),

      finishRound: () => {
        const active = get().activeRound;
        if (!active) return null;
        const finished: Round = { ...active, finishedAt: new Date().toISOString() };
        set((s) => ({ activeRound: null, rounds: [finished, ...s.rounds] }));
        return finished;
      },

      discardRound: () => set({ activeRound: null }),
    }),
    {
      name: "loopmind.rounds",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ activeRound: s.activeRound, rounds: s.rounds }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/** Aggregate stats used by Practice mode and round summaries. */
export function summarizeRound(round: Round) {
  const played = round.holeScores;
  const totalStrokes = played.reduce((a, h) => a + h.strokes, 0);
  const totalPar = played.reduce((a, h) => a + h.par, 0);
  const putts = played.reduce((a, h) => a + h.putts, 0);
  const penalties = played.reduce((a, h) => a + h.penalties, 0);
  const fairwayHoles = played.filter((h) => h.fairwayHit !== null);
  const fairwaysHit = fairwayHoles.filter((h) => h.fairwayHit === true).length;
  const gir = played.filter((h) => h.greenInRegulation).length;
  return {
    totalStrokes,
    totalPar,
    toPar: totalStrokes - totalPar,
    putts,
    penalties,
    fairwaysHit,
    fairwayChances: fairwayHoles.length,
    gir,
    holes: played.length,
  };
}
