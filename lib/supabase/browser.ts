import { createClient } from "@supabase/supabase-js";

// The browser client carries the Clerk session token, so a private realtime
// channel authorizes as the signed-in member. A bare client would connect and
// then receive nothing.
export function createBrowserClient(getToken: () => Promise<string | null>) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase browser environment is not set");
  return createClient(url, key, {
    accessToken: getToken,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
