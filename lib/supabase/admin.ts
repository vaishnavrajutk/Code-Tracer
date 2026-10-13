import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Bypasses row-level security, so it is for the pipeline's writes only. Never
// use it to read on behalf of a user: reads go through createSupabaseClient,
// where the policies decide.
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
