import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

const createClient = globalThis.supabase?.createClient;
const configured =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_") &&
  SUPABASE_PUBLISHABLE_KEY.length > 20 &&
  !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_") &&
  typeof createClient === "function";

export const isSupabaseConfigured = configured;
export const supabase = configured
  ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase belum siap. Pastikan konfigurasi dan library lokal Supabase tersedia.",
    );
  }
  return supabase;
}
