import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_COOKIE_OPTIONS } from "@/lib/supabase-cookies";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Browser client — cookie-backed storage (shared with the server
// clients via SUPABASE_COOKIE_OPTIONS). PKCE verifier and session both
// live in persistent cookies, not localStorage. Null when env vars are
// absent so the app still boots in local-only mode during development.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createBrowserClient(url!, anonKey!, {
      cookieOptions: SUPABASE_COOKIE_OPTIONS,
      auth: {
        flowType: "pkce",
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
      },
    })
  : null;
