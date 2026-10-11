import "server-only";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// The Clerk session token travels with every request, so a row-level policy
// can read the organization claim from it. Sessions belong to Clerk alone:
// this client keeps none of its own.
// The token is read up front, outside the client's own error handling, so
// Next sees the request-scoped read and renders the page dynamically.
export async function createSupabaseClient() {
  const token = await (await auth()).getToken();
  return createClient(env.supabaseUrl, env.supabasePublishableKey, {
    accessToken: async () => token,
  });
}
