import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env.server";
import { fetchWithTimeout, supabaseConfig } from "./server";

/**
 * Service-role client. Bypasses RLS — use only for narrowly scoped server tasks (rate limiting, security events,
 * webhooks). Never pass user input into it without validation, and never return its results unfiltered.
 */
export function createSupabaseAdminClient() {
  const { url } = supabaseConfig();
  const key = getServerEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout },
  });
}
