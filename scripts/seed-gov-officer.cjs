/**
 * Provision the first Government Portal officer (bootstrap helper).
 *
 * OUT-OF-BAND setup utility, NOT part of the product and NOT exposed as an
 * API route. Reads credentials from .env.local (service-role access) and
 * configuration exclusively from environment variables — the officer's
 * password is never stored in a file, printed, or logged.
 *
 * Usage:
 *   $env:GOV_SEED_BOOTSTRAP="1"
 *   $env:GOV_SEED_EMAIL="officer@gov.example.com"
 *   $env:GOV_SEED_PASSWORD="<choose a strong password>"
 *   $env:GOV_SEED_NAME="Ananya Sharma"
 *   $env:GOV_SEED_CODE="GOV-01-0001"            # optional; default derived
 *   $env:GOV_SEED_ROLE="SUPER_ADMIN"            # optional; default SUPER_ADMIN
 *   $env:GOV_SEED_SCOPE="ALL_INDIA"             # optional; default ALL_INDIA
 *   $env:GOV_SEED_STATE="28"                    # optional; LGD-style code
 *   $env:GOV_SEED_DISTRICT=""                   # optional; LGD-style code
 *   $env:GOV_SEED_DEPT="Cyber Crime"           # optional
 *   node scripts/seed-gov-officer.cjs
 *
 * Safety: refuses to run unless GOV_SEED_BOOTSTRAP === "1". On an existing
 * officer it updates role/scope/status to the requested values and bumps
 * session_version (invalidate stale sessions) only when those change.
 */

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

const ROOT = path.join(__dirname, "..");

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
  console.error(`seed-gov-officer: ${message}`);
  process.exit(1);
}

(async () => {
  if (process.env.GOV_SEED_BOOTSTRAP !== "1") {
    fail(
      "refusing to run: set GOV_SEED_BOOTSTRAP=1 to confirm this is an intentional bootstrap.",
    );
  }

  const email = (process.env.GOV_SEED_EMAIL || "").toLowerCase().trim();
  const password = process.env.GOV_SEED_PASSWORD || "";
  const fullName = (process.env.GOV_SEED_NAME || "").trim();
  const code = (process.env.GOV_SEED_CODE || "").trim();
  const role = (process.env.GOV_SEED_ROLE || "SUPER_ADMIN").trim();
  const scope = (process.env.GOV_SEED_SCOPE || "ALL_INDIA").trim();
  const state = (process.env.GOV_SEED_STATE || "").trim() || null;
  const district = (process.env.GOV_SEED_DISTRICT || "").trim() || null;
  const department = (process.env.GOV_SEED_DEPT || "").trim() || null;

  if (!email || email.length > 320) fail("GOV_SEED_EMAIL is required.");
  if (!password) fail("GOV_SEED_PASSWORD is required (choose a strong password).");
  if (!fullName) fail("GOV_SEED_NAME is required.");
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    fail("GOV_SEED_EMAIL is not a valid email address.");
  }
  if (password.length < 8) fail("GOV_SEED_PASSWORD must be at least 8 characters.");
  if (!["SUPER_ADMIN", "STATE_ADMIN", "DISTRICT_OFFICER", "INVESTIGATOR", "ANALYST", "AUDITOR"].includes(role)) {
    fail(`Unsupported GOV_SEED_ROLE: ${role}`);
  }
  if (!["ALL_INDIA", "STATE", "DISTRICT", "ASSIGNED_CASES"].includes(scope)) {
    fail(`Unsupported GOV_SEED_SCOPE: ${scope}`);
  }
  if (scope === "STATE" && !state) fail("GOV_SEED_STATE is required for STATE scope.");
  if (scope === "DISTRICT" && (!state || !district)) {
    fail("GOV_SEED_STATE and GOV_SEED_DISTRICT are required for DISTRICT scope.");
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("Missing Supabase URL/service-role key in .env.local.");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Deterministic officer code when not supplied.
  const officerCode =
    code || `${role === "SUPER_ADMIN" ? "GOV-00" : "GOV-01"}-${fullName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .toUpperCase()}`;

  const { data: existing } = await sb
    .from("gov_officers")
    .select("*")
    .eq("official_email", email)
    .maybeSingle();

  const credentialRow = {
    officer_id: null,
    password_hash: await bcrypt.hash(password, 12),
    password_updated_at: new Date().toISOString(),
    must_rotate: false,
    cred_status: "ACTIVE",
    failed_attempts: 0,
    locked_until: null,
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const changed =
      existing.role !== role ||
      existing.scope !== scope ||
      (existing.state_code || null) !== state ||
      (existing.district_code || null) !== district ||
      existing.status !== "ACTIVE";

    const officerPatch = {
      full_name: fullName,
      official_email: email,
      role,
      status: "ACTIVE",
      scope,
      state_code: state,
      district_code: district,
      department: department ?? existing.department ?? null,
      updated_at: new Date().toISOString(),
      deactivated_at: null,
      deactivation_reason: null,
    };
    if (changed) {
      officerPatch.session_version = (existing.session_version || 0) + 1;
    }

    const { data: updated, error: updateError } = await sb
      .from("gov_officers")
      .update(officerPatch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError) fail(`Failed to update officer: ${updateError.message}`);
    credentialRow.officer_id = updated.id;

    if (changed) {
      // Revoke live sessions so stale privilege claims are invalidated.
      await sb
        .from("gov_sessions")
        .update({ revoked_at: new Date().toISOString(), revoke_reason: "bootstrap_privilege_change" })
        .eq("officer_id", updated.id)
        .is("revoked_at", null);
      console.log(`seed-gov-officer: privilege changed — bumped session_version to ${officerPatch.session_version}.`);
    }
  } else {
    const { data: created, error: createError } = await sb
      .from("gov_officers")
      .insert({
        officer_code: officerCode,
        full_name: fullName,
        official_email: email,
        official_phone: null,
        role,
        status: "ACTIVE",
        department,
        scope,
        state_code: state,
        district_code: district,
        session_version: 1,
      })
      .select("*")
      .single();
    if (createError) fail(`Failed to create officer: ${createError.message}`);
    credentialRow.officer_id = created.id;
  }

  const { error: credentialError } = await sb
    .from("gov_credentials")
    .upsert(credentialRow, { onConflict: "officer_id" });
  if (credentialError) fail(`Failed to set credential: ${credentialError.message}`);

  console.log("seed-gov-officer: done.");
  console.log(`  officer   : ${credentialRow.officer_id}`);
  console.log(`  email     : ${email}`);
  console.log(`  code      : ${officerCode}`);
  console.log(`  role      : ${role}`);
  console.log(`  scope     : ${scope}${state ? ` / state ${state}` : ""}${district ? ` / district ${district}` : ""}`);
  console.log("  password  : (not printed; set via GOV_SEED_PASSWORD)");
})();