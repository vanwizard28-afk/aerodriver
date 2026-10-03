import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Browser client. Null when env vars are absent so the app still boots
// in localStorage-only mode during development.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createBrowserClient(url!, anonKey!)
  : null;
