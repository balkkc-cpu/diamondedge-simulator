/**
 * Centralized environment access.
 *
 * Expo inlines any variable prefixed with `EXPO_PUBLIC_` at build time, so the
 * app reads configuration from `.env` (see `.env.example`). Metro only replaces
 * STATICALLY referenced `process.env.EXPO_PUBLIC_*` expressions, so each key is
 * read explicitly below (never via a dynamic key).
 *
 * Every integration is OPTIONAL: when a key is missing the app falls back to
 * offline/mock data so it stays fully runnable.
 */

function clean(value: string | undefined): string | undefined {
  if (!value || value.trim() === "" || value.includes("your-")) return undefined;
  return value.trim();
}

export const env = {
  supabaseUrl: clean(process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: clean(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  openaiApiKey: clean(process.env.EXPO_PUBLIC_OPENAI_API_KEY),
  weatherApiKey: clean(process.env.EXPO_PUBLIC_WEATHER_API_KEY),
  mapboxToken: clean(process.env.EXPO_PUBLIC_MAPBOX_TOKEN),
};

export const isSupabaseConfigured = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const isOpenAIConfigured = Boolean(env.openaiApiKey);
export const isWeatherConfigured = Boolean(env.weatherApiKey);
