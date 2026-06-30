import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface SettingsState {
  /** Master switch for the talking caddie. */
  voiceEnabled: boolean;
  /** Automatically speak a recommendation as soon as it's generated. */
  autoAnnounce: boolean;
  /** Speak live yardage updates while walking the hole. */
  announceLiveYardage: boolean;
  /** Advanced scoring (fairways, putts, GIR, penalties, chips) vs basic strokes only. */
  advancedScoring: boolean;
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setVoiceEnabled: (v: boolean) => void;
  setAutoAnnounce: (v: boolean) => void;
  setAnnounceLiveYardage: (v: boolean) => void;
  setAdvancedScoring: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      autoAnnounce: true,
      announceLiveYardage: true,
      advancedScoring: false,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setVoiceEnabled: (v) => set({ voiceEnabled: v }),
      setAutoAnnounce: (v) => set({ autoAnnounce: v }),
      setAnnounceLiveYardage: (v) => set({ announceLiveYardage: v }),
      setAdvancedScoring: (v) => set({ advancedScoring: v }),
    }),
    {
      name: "loopmind.settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        voiceEnabled: s.voiceEnabled,
        autoAnnounce: s.autoAnnounce,
        announceLiveYardage: s.announceLiveYardage,
        advancedScoring: s.advancedScoring,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
