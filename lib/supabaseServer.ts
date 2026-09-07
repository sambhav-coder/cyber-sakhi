import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client for privileged operations
 * (password verification, profile upsert, future persisted case/evidence writes).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.
 * Never import this module from Client Components.
 * Never prefix these keys with NEXT_PUBLIC_.
 */
function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "lib/supabaseServer.ts is server-only and must not be imported in client-side code."
    );
  }
}

let serverClient: SupabaseClient | null = null;

export function getSupabaseServer(): SupabaseClient {
  assertServerOnly();

  if (serverClient) {
    return serverClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY). This server-only key is required for privileged database operations and must never be exposed to the client."
    );
  }

  serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serverClient;
}
