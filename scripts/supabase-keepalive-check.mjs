/**
 * Supabase keep-alive check (read-only, workflow-equivalent).
 *
 * Performs ONE minimal SELECT against public.supabase_keepalive_heartbeat
 * using the publishable/anon key only. Never writes, never logs secrets.
 *
 * Env (NAME ONLY — pass values via environment, never commit them):
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *
 * Exit codes: 0 = PASS, 1 = auth/permission FAIL, 2 = connection/paused FAIL.
 *
 * Usage:
 *   SUPABASE_URL="https://xyzcompany.supabase.co" \
 *   SUPABASE_ANON_KEY="<anon-key>" \
 *   node scripts/supabase-keepalive-check.mjs
 */

const TIMEOUT_MS = 20_000;

function getEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return "";
}

async function main() {
  const url = getEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = getEnv("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");

  if (!url) {
    console.error(
      "FAIL: missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL fallback)."
    );
    process.exit(2);
  }
  if (!anonKey) {
    console.error(
      "FAIL: missing SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY fallback). Never use the service-role key here."
    );
    process.exit(1);
  }

  const endpoint = `${url.replace(/\/+$/, "")}/rest/v1/supabase_keepalive_heartbeat?select=id,heartbeat_at&limit=1`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    const reason =
      err && err.name === "AbortError" ? "timed out" : "unreachable";
    console.error(
      `FAIL: connection error — Supabase ${reason} (network failure, timeout, or paused project). ` +
        `The owner must resume the project in the Supabase Dashboard.`
    );
    process.exit(2);
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    console.error(
      `FAIL: authentication/permission error (HTTP ${res.status}). Verify the anon key and that supabase/migrations/supabase_keepalive_heartbeat.sql has been applied.`
    );
    process.exit(1);
  }
  if (res.status === 404) {
    console.error(
      "FAIL: heartbeat table not found (HTTP 404). Apply supabase/migrations/supabase_keepalive_heartbeat.sql in the Supabase SQL Editor."
    );
    process.exit(1);
  }
  if (!res.ok) {
    console.error(
      `FAIL: Supabase request failed (HTTP ${res.status}). The project may be unreachable or paused. The owner must resume it in the Supabase Dashboard.`
    );
    process.exit(2);
  }

  let payload;
  try {
    payload = await res.json();
  } catch {
    console.error("FAIL: HTTP 200 but the response was not valid JSON.");
    process.exit(2);
  }

  const row = Array.isArray(payload) ? payload[0] : payload;
  if (row && typeof row.id !== "undefined") {
    console.log("PASS: read-only database query succeeded (heartbeat row returned).");
    return;
  }
  console.error("FAIL: HTTP 200 but the expected heartbeat row was not returned.");
  process.exit(2);
}

// Never print secrets or authorization headers.
await main();
