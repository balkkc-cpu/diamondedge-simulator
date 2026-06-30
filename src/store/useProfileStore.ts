import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Club, ClubId, DominantHand, PlayerProfile, ShotShape, SkillLevel } from "@/types/models";
import { buildDefaultBag, CLUB_ORDER, DEFAULT_SKILL } from "@/constants/clubs";

/** Add any clubs from the catalog that a saved bag doesn't have yet (off by default). */
function reconcileBag(clubs: Club[]): Club[] {
  const byId = new Map(clubs.map((c) => [c.id, c]));
  return CLUB_ORDER.map(
    (meta) => byId.get(meta.id) ?? { id: meta.id, label: meta.label, distanceYards: 0, inBag: false },
  );
}

interface ProfileState {
  profile: PlayerProfile;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setSkill: (skill: SkillLevel) => void;
  setHand: (hand: DominantHand) => void;
  setShotShape: (shape: ShotShape) => void;
  /** Apply skill-based default distances ("I don't know my distances"). */
  applyDefaultDistances: (skill: SkillLevel) => void;
  setClubDistance: (id: ClubId, yards: number) => void;
  toggleClubInBag: (id: ClubId) => void;
  setClubs: (clubs: Club[]) => void;
  completeOnboarding: () => void;
  reset: () => void;
}

const initialProfile: PlayerProfile = {
  skillLevel: DEFAULT_SKILL,
  dominantHand: "right",
  shotShape: "straight",
  usesDefaultDistances: true,
  clubs: buildDefaultBag(DEFAULT_SKILL),
  onboardingComplete: false,
};

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profile: initialProfile,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),

      setSkill: (skill) =>
        set((s) => {
          // If the player is still on defaults, refresh the bag to match skill.
          const clubs = s.profile.usesDefaultDistances ? buildDefaultBag(skill) : s.profile.clubs;
          return { profile: { ...s.profile, skillLevel: skill, clubs } };
        }),

      setHand: (hand) => set((s) => ({ profile: { ...s.profile, dominantHand: hand } })),
      setShotShape: (shape) => set((s) => ({ profile: { ...s.profile, shotShape: shape } })),

      applyDefaultDistances: (skill) =>
        set((s) => ({
          profile: { ...s.profile, clubs: buildDefaultBag(skill), usesDefaultDistances: true },
        })),

      setClubDistance: (id, yards) =>
        set((s) => ({
          profile: {
            ...s.profile,
            usesDefaultDistances: false,
            clubs: s.profile.clubs.map((c) =>
              c.id === id ? { ...c, distanceYards: Math.max(0, Math.round(yards)) } : c,
            ),
          },
        })),

      toggleClubInBag: (id) =>
        set((s) => ({
          profile: {
            ...s.profile,
            clubs: s.profile.clubs.map((c) => (c.id === id ? { ...c, inBag: !c.inBag } : c)),
          },
        })),

      setClubs: (clubs) => set((s) => ({ profile: { ...s.profile, clubs } })),

      completeOnboarding: () =>
        set((s) => ({ profile: { ...s.profile, onboardingComplete: true } })),

      reset: () => set({ profile: initialProfile }),
    }),
    {
      name: "loopmind.profile",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ profile: s.profile }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          // Bring older saved bags up to the current club catalog.
          state.profile = { ...state.profile, clubs: reconcileBag(state.profile.clubs) };
          state.setHasHydrated(true);
        }
      },
    },
  ),
);
