import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "./env";

/**
 * Supabase client. Returns `null` when credentials are not configured, in which
 * case the app runs in offline mode (see `useAuthStore`) using local storage.
 *
 * The schema this expects lives in `supabase/schema.sql`.
 */
let client: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  client = createClient(env.supabaseUrl as string, env.supabaseAnonKey as string, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
}

export const supabase = client;
export { isSupabaseConfigured };
