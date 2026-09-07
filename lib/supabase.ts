import { createClient } from "@supabase/supabase-js";

/**
 * Browser / RLS-scoped Supabase client.
 * Uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY only.
 * Privileged server operations must use lib/supabaseServer.ts.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!supabasePublishableKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(
  supabaseUrl,
  supabasePublishableKey
);