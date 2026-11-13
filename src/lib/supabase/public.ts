import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "./server";

/** Cookie-less anon client for public catalogue reads (no session, RLS/grants as `anon`). */
export function createSupabasePublicClient() {
  const { url, anonKey } = supabaseConfig();
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
