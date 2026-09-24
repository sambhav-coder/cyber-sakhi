/**
 * Provision the FIRST TOTP factor for a government officer (bootstrap ceremony).
 *
 * Why this exists: sign-in always requires a verified second factor, so a
 * newly seeded officer cannot self-enroll (they hold no session yet). The
 * first factor is therefore provisioned out-of-band by an administrator
 * running this script. Later replacements use the authenticated /gov/mfa
 * flow (which additionally demands fresh MFA) — never this script, unless
 * the officer is fully locked out and re-provisioning is approved.
 *
 * Usage:
 *   $env:GOV_MFA_BOOTSTRAP="1"
 *   $env:GOV_MFA_CODE="DL-CYB-0001"        # or GOV_MFA_EMAIL="…"
 *   $env:GOV_MFA_ENCRYPTION_KEY="<32-byte base64>"   # same key as the app
 *   node scripts/gov-enroll-mfa.cjs
 *
 * Safety:
 * - Refuses to run unless GOV_MFA_BOOTSTRAP === "1".
 * - Refuses when an ACTIVE factor already exists (use /gov/mfa to replace).
 * - Prints the provisioning URI + manual key EXACTLY ONCE to this terminal.
 *   Transmit it to the officer over a verified channel, then clear the
 *   terminal. Never commit, log, or screenshot it.
 * - Writes a best-effort `mfa.enrolled` audit row (system actor); a failure
 *   is reported loudly but does not roll back the factor — record issuance
 *   manually in that case.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

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
  console.error(`gov-enroll-mfa: ${message}`);
  process.exit(1);
}

function encodeBase32(data) {
  let bits = "";
  for (const byte of data) bits += byte.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, "0"), 2)];
  }
  return out;
}

function encryptSecret(secret, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}

(async () => {
  if (process.env.GOV_MFA_BOOTSTRAP !== "1") {
    fail("refusing to run: set GOV_MFA_BOOTSTRAP=1 to confirm this is an intentional bootstrap.");
  }
  const keyRaw = process.env.GOV_MFA_ENCRYPTION_KEY || "";
  let key = null;
  try {
    const parsed = Buffer.from(keyRaw, "base64");
    if (parsed.length === 32) key = parsed;
  } catch { /* fall through */ }
  if (!key) fail("GOV_MFA_ENCRYPTION_KEY must be set to a 32-byte base64 key (same value the app uses).");

  const code = (process.env.GOV_MFA_CODE || "").trim();
  const email = (process.env.GOV_MFA_EMAIL || "").toLowerCase().trim();
  if (!code && !email) fail("Set GOV_MFA_CODE (Officer ID) or GOV_MFA_EMAIL.");

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

  const { data: existing } = await sb
    .from("gov_mfa_factors")
    .select("officer_id,enabled_at,revoked_at")
    .eq("officer_id", officer.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existing && existing.enabled_at) {
    fail(`Officer ${officer.officer_code} already has an active factor; replace it from /gov/mfa instead.`);
  }

  const secret = encodeBase32(crypto.randomBytes(20));
  const now = new Date().toISOString();
  const { error: upsertError } = await sb.from("gov_mfa_factors").upsert(
    {
      officer_id: officer.id,
      secret_ciphertext: encryptSecret(secret, key),
      enabled_at: now,
      revoked_at: null,
      pending_secret_ciphertext: null,
      pending_created_at: null,
      updated_at: now,
    },
    { onConflict: "officer_id" },
  );
  if (upsertError) fail(`Failed to store factor: ${upsertError.message}`);

  const label = encodeURIComponent(`Cyber-Sakhi-Gov:${officer.officer_code}`);
  const otpauthUrl =
    `otpauth://totp/${label}?secret=${secret}&issuer=Cyber-Sakhi-Gov&algorithm=SHA1&digits=6&period=30`;

  try {
    const { error: auditError } = await sb.from("audit_logs").insert({
      actor_type: "system",
      system_job: "bootstrap",
      actor_gov_id: officer.id,
      action: "mfa.enrolled",
      entity: "gov_auth",
      outcome: "allow",
      correlation_id: crypto.randomUUID(),
      idempotency_key: crypto.randomUUID(),
      payload: { channel: "admin_bootstrap" },
      redacted: false,
    });
    if (auditError) console.warn(`gov-enroll-mfa: WARNING: audit insert failed (${auditError.message}); record issuance manually.`);
  } catch (err) {
    console.warn(`gov-enroll-mfa: WARNING: audit insert failed (${err.message}); record issuance manually.`);
  }

  console.log("gov-enroll-mfa: factor ACTIVE. Provisioning material below is shown ONCE.");
  console.log(`  officer : ${officer.officer_code} (${officer.full_name})`);
  console.log("  steps   : Google Authenticator → + → Enter a setup key → paste the manual key.");
  console.log(`  manual  : ${secret}`);
  console.log(`  uri     : ${otpauthUrl}`);
  console.log("  WARNING : transmit over a verified channel, then clear this terminal. Never commit or log it.");
})();
