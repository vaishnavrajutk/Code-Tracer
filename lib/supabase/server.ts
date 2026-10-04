import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// The Clerk session token travels with every request, so a row-level policy
// can read the organization claim from it. Sessions belong to Clerk alone:
// this client keeps none of its own.
export function createSupabaseClient() {
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => (await auth()).getToken(),
  });
}
