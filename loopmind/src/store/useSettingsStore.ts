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
  hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setVoiceEnabled: (v: boolean) => void;
  setAutoAnnounce: (v: boolean) => void;
  setAnnounceLiveYardage: (v: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      voiceEnabled: true,
      autoAnnounce: true,
      announceLiveYardage: true,
      hasHydrated: false,
      setHasHydrated: (v) => set({ hasHydrated: v }),
      setVoiceEnabled: (v) => set({ voiceEnabled: v }),
      setAutoAnnounce: (v) => set({ autoAnnounce: v }),
      setAnnounceLiveYardage: (v) => set({ announceLiveYardage: v }),
    }),
    {
      name: "loopmind.settings",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        voiceEnabled: s.voiceEnabled,
        autoAnnounce: s.autoAnnounce,
        announceLiveYardage: s.announceLiveYardage,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
