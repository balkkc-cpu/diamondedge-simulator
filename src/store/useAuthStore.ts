import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  offlineMode: boolean;
  hasHydrated: boolean;
  /** Local-only credential store used when Supabase is not configured. */
  localCredentials: Record<string, string>;
  setHasHydrated: (v: boolean) => void;
  signUp: (email: string, password: string) => Promise<{ error?: string }>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

function normalize(email: string) {
  return email.trim().toLowerCase();
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      offlineMode: !isSupabaseConfigured,
      hasHydrated: false,
      localCredentials: {},
      setHasHydrated: (v) => set({ hasHydrated: v }),

      signUp: async (email, password) => {
        const e = normalize(email);
        if (!e.includes("@")) return { error: "Enter a valid email address." };
        if (password.length < 6) return { error: "Password must be at least 6 characters." };

        if (isSupabaseConfigured && supabase) {
          const { data, error } = await supabase.auth.signUp({ email: e, password });
          if (error) return { error: error.message };
          const u = data.user;
          if (u) set({ user: { id: u.id, email: u.email ?? e } });
          return {};
        }

        // Offline mode (no Supabase): store credentials locally for this device.
        // NOTE: local demo only — not secure storage; configure Supabase for real auth.
        const creds = { ...get().localCredentials };
        if (creds[e]) return { error: "An account with that email already exists." };
        creds[e] = password;
        set({
          localCredentials: creds,
          user: { id: `local-${e}`, email: e },
          offlineMode: true,
        });
        return {};
      },

      signIn: async (email, password) => {
        const e = normalize(email);
        if (isSupabaseConfigured && supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
          if (error) return { error: error.message };
          const u = data.user;
          if (u) set({ user: { id: u.id, email: u.email ?? e } });
          return {};
        }

        const stored = get().localCredentials[e];
        if (!stored) return { error: "No local account found — sign up first." };
        if (stored !== password) return { error: "Incorrect password." };
        set({ user: { id: `local-${e}`, email: e }, offlineMode: true });
        return {};
      },

      signOut: async () => {
        if (isSupabaseConfigured && supabase) {
          await supabase.auth.signOut().catch(() => {});
        }
        set({ user: null });
      },
    }),
    {
      name: "loopmind.auth",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ user: s.user, localCredentials: s.localCredentials }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
