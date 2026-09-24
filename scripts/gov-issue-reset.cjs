/**
 * Issue a single-use password-reset link for a government officer.
 *
 * Out-of-band administrator workflow backing Forgot Password: the public
 * endpoint never discloses tokens, so an administrator verifies the
 * officer (identity check per department procedure) and runs this script.
 * The printed link is valid for 30 minutes and single-use; completing it
 * rotates the credential and signs out every live session.
 *
 * Usage:
 *   $env:GOV_RESET_BOOTSTRAP="1"
 *   $env:GOV_RESET_CODE="DL-CYB-0001"       # or GOV_RESET_EMAIL="…"
 *   node scripts/gov-issue-reset.cjs
 *
 * Safety: refuses unless GOV_RESET_BOOTSTRAP === "1"; refuses for
 * non-ACTIVE officers; retires previous live tokens; prints the link
 * ONCE — transmit over a verified channel, then clear the terminal.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const RESET_TTL_MS = 30 * 60 * 1000;

function loadEnv() {
  const env = {};
  const file = path.join(ROOT, ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim();
    }
  }
  return env;
}

function fail(message) {
  console.error(`gov-issue-reset: ${message}`);
  process.exit(1);
}

(async () => {
  if (process.env.GOV_RESET_BOOTSTRAP !== "1") {
    fail("refusing to run: set GOV_RESET_BOOTSTRAP=1 to confirm this is an intentional issuance.");
  }
  const code = (process.env.GOV_RESET_CODE || "").trim();
  const email = (process.env.GOV_RESET_EMAIL || "").toLowerCase().trim();
  if (!code && !email) fail("Set GOV_RESET_CODE (Officer ID) or GOV_RESET_EMAIL.");

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !serviceKey) fail("Missing Supabase URL/service-role key in .env.local.");
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const query = sb.from("gov_officers").select("id,officer_code,full_name,status");
  const { data: officer, error: officerError } = code
    ? await query.ilike("officer_code", code).maybeSingle()
    : await query.eq("official_email", email).maybeSingle();
  if (officerError) fail(`Officer lookup failed: ${officerError.message}`);
  if (!officer) fail("No officer matches the supplied identifier.");
  if (officer.status !== "ACTIVE") fail(`Officer ${officer.officer_code} is not ACTIVE; refusing.`);

  const { error: retireError } = await sb
    .from("gov_password_resets")
    .delete()
    .eq("officer_id", officer.id)
    .is("used_at", null);
  if (retireError) fail(`Failed to retire old tokens: ${retireError.message}`);

  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token, "utf8").digest("hex");
  const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
  const { error: insertError } = await sb.from("gov_password_resets").insert({
    officer_id: officer.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });
  if (insertError) fail(`Failed to create reset token: ${insertError.message}`);

  try {
    const { error: auditError } = await sb.from("audit_logs").insert({
      actor_type: "system",
      system_job: "bootstrap",
      actor_gov_id: officer.id,
      action: "auth.password_reset_requested",
      entity: "gov_auth",
      outcome: "allow",
      correlation_id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
      payload: { channel: "admin_issued" },
      redacted: false,
    });
    if (auditError) console.warn(`gov-issue-reset: WARNING: audit insert failed (${auditError.message}); record issuance manually.`);
  } catch (err) {
    console.warn(`gov-issue-reset: WARNING: audit insert failed (${err.message}); record issuance manually.`);
  }

  const base = (env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  console.log("gov-issue-reset: single-use link below (valid 30 minutes). Shown ONCE.");
  console.log(`  officer : ${officer.officer_code} (${officer.full_name})`);
  console.log(`  link    : ${base}/gov/login/reset-password?token=${token}`);
  console.log("  WARNING : transmit over a verified channel, then clear this terminal. Never commit or log it.");
})();
