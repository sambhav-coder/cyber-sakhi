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
 *   $env:GOV_SEED_PASSWORD="<choose a strong password, 12+ chars>"
 *   $env:GOV_SEED_NAME="Ananya Sharma"
 *   $env:GOV_SEED_CODE="DL-CYB-0001"             # canonical Officer ID SS-DDD-NNNN
 *   $env:GOV_SEED_ROLE="SUPER_ADMIN"            # optional; default SUPER_ADMIN
 *   $env:GOV_SEED_SCOPE="ALL_INDIA"             # optional; default ALL_INDIA
 *   $env:GOV_SEED_STATE="28"                    # optional; LGD-style code
 *   $env:GOV_SEED_DISTRICT=""                   # optional; LGD-style code
 *   $env:GOV_SEED_DEPT="Cyber Crime"           # optional
 *   $env:GOV_SEED_DEMO="1"                      # optional; SIH demo account mode
 *   node scripts/seed-gov-officer.cjs
 *
 * Officer ID format: canonical codes look like DL-CYB-0001 (2-letter state
 * jurisdiction + 3-letter department + 4-digit serial). The catalogue of
 * valid states/departments lives in lib/gov/govOfficerCode.ts (source of
 * truth); this script enforces the same shape plus the state/department
 * sets below. Legacy GOV-01-XXXX codes are still accepted for existing
 * accounts but new accounts should use the canonical format.
 *
 * SIH demo mode (GOV_SEED_DEMO=1): least-privilege demonstration account
 * (ANALYST + STATE scope + DEMO jurisdiction, clearly labelled). MFA must
 * still be provisioned via scripts/gov-enroll-mfa.cjs — there is no bypass.
 * Disable after the demo with: set status REVOKED (Supabase dashboard or
 * SQL: update gov_officers set status='REVOKED' where officer_code='…';
 * then bump session_version to kill live sessions).
 *
 * Safety: refuses to run unless GOV_SEED_BOOTSTRAP === "1".
 *
 * Re-seed behavior (existing officer): looked up by GOV_SEED_CODE first,
 * then by GOV_SEED_EMAIL. A code/email divergence, or an email already
 * assigned to a different officer, fails closed. Re-seeding updates ONLY
 * identity (full name, official email) and the password credential, and
 * ALWAYS bumps session_version plus revokes live sessions (password
 * rotation must never leave old sessions usable). Role, scope,
 * jurisdiction, department, and status are preserved — privilege changes
 * are out of scope for this script. MFA factors and recovery codes are
 * never touched. A REVOKED credential is never resurrected.
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

// Canonical Officer ID validation (mirrors lib/gov/govOfficerCode.ts,
// which is the source of truth). Legacy GOV-… codes pass through for
// pre-existing accounts only.
const CANONICAL_CODE_PATTERN = /^([A-Za-z]{2,4})-([A-Za-z]{3})-(\d{4})$/;
const KNOWN_STATES = new Set(
  "AP AR AS BR CG GA GJ HR HP JH KA KL MP MH MN ML MZ NL OD PB RJ SK TN TG TR UP UT WB AN CH DN DL JK LA LD PY DEMO".split(" "),
);
const KNOWN_DEPTS = new Set(["CYB", "FOR", "INR", "THI", "EVC", "AUD", "ADM"]);

function validateOfficerCode(code) {
  const trimmed = (code || "").trim();
  if (!trimmed) return { code: "", canonical: false };
  const match = CANONICAL_CODE_PATTERN.exec(trimmed.toUpperCase());
  if (match) {
    const [, state, dept, serialText] = match;
    if (!KNOWN_STATES.has(state)) fail(`Officer code state '${state}' is not a known jurisdiction.`);
    if (!KNOWN_DEPTS.has(dept)) fail(`Officer code department '${dept}' is not in the approved catalogue.`);
    const serial = parseInt(serialText, 10);
    if (!(serial >= 1 && serial <= 9999)) fail("Officer code serial must be 0001-9999.");
    return { code: `${state}-${dept}-${serialText}`, canonical: true };
  }
  if (/^GOV-/i.test(trimmed)) {
    console.warn("seed-gov-officer: WARNING: legacy GOV-… officer code; prefer canonical SS-DDD-NNNN for new accounts.");
    return { code: trimmed.toUpperCase(), canonical: false };
  }
  fail("GOV_SEED_CODE must be a canonical Officer ID (e.g. DL-CYB-0001) or a legacy GOV-… code.");
  return { code: "", canonical: false };
}

// Government password policy mirror. Source of truth is
// lib/gov/govPasswordPolicy.ts (this script cannot import TypeScript).
// Keep the constants below in sync with that module.
const GOV_PASSWORD_MIN_LENGTH = 12;
const GOV_PASSWORD_MAX_LENGTH = 256;
const GOV_PASSWORD_DENIED_SUBSTRINGS = [
  "password",
  "cybersakhi",
  "cyber-sakhi",
  "cyber",
  "sakhi",
  "govind",
  "admin",
  "officer",
  "qwerty",
  "letmein",
  "welcome",
];

function evaluateSeedPassword(password) {
  const reasons = [];
  if (password.length < GOV_PASSWORD_MIN_LENGTH) {
    reasons.push(`Use at least ${GOV_PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > GOV_PASSWORD_MAX_LENGTH) {
    reasons.push(`Keep the password under ${GOV_PASSWORD_MAX_LENGTH} characters.`);
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password),
  ).length;
  if (classes < 3) {
    reasons.push("Include at least three of: lowercase, uppercase, digits, symbols.");
  }
  const lowered = password.toLowerCase();
  if (GOV_PASSWORD_DENIED_SUBSTRINGS.some((word) => lowered.includes(word))) {
    reasons.push("Avoid common words and product names in the password.");
  }
  if (/^(.)\1+$/.test(password)) {
    reasons.push("Avoid repeating a single character.");
  }
  return reasons;
}

async function findOfficerByCode(sb, code) {
  if (!code) return null;
  const { data, error } = await sb
    .from("gov_officers")
    .select("*")
    .ilike("officer_code", code)
    .maybeSingle();
  if (error) fail(`Officer code lookup failed: ${error.message}`);
  return data ?? null;
}

async function findOfficerByEmail(sb, email) {
  const { data, error } = await sb
    .from("gov_officers")
    .select("*")
    .ilike("official_email", email)
    .maybeSingle();
  if (error) fail(`Officer email lookup failed: ${error.message}`);
  return data ?? null;
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
  const demoMode = process.env.GOV_SEED_DEMO === "1";
  const role = (process.env.GOV_SEED_ROLE || (demoMode ? "ANALYST" : "SUPER_ADMIN")).trim();
  const scope = (process.env.GOV_SEED_SCOPE || (demoMode ? "STATE" : "ALL_INDIA")).trim();
  const state = (process.env.GOV_SEED_STATE || (demoMode ? "DEMO" : "")).trim() || null;
  const district = (process.env.GOV_SEED_DISTRICT || "").trim() || null;
  const department = (process.env.GOV_SEED_DEPT || (demoMode ? "SIH Demonstration" : "")).trim() || null;
  const checkedCode = validateOfficerCode(process.env.GOV_SEED_CODE || "");

  if (!email || email.length > 320) fail("GOV_SEED_EMAIL is required.");
  if (!password) fail("GOV_SEED_PASSWORD is required (choose a strong password).");
  if (!fullName) fail("GOV_SEED_NAME is required.");
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email)) {
    fail("GOV_SEED_EMAIL is not a valid email address.");
  }
  const passwordReasons = evaluateSeedPassword(password);
  if (passwordReasons.length > 0) {
    fail(`GOV_SEED_PASSWORD rejected by government policy: ${passwordReasons.join(" ")}`);
  }
  if (demoMode && role === "SUPER_ADMIN") {
    fail("GOV_SEED_DEMO=1 refuses SUPER_ADMIN: the demo account must stay least-privilege.");
  }
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

  // Deterministic officer code when not supplied. Demo mode mints a
  // canonical DEMO-jurisdiction code; otherwise a legacy-style code.
  const officerCode =
    checkedCode.code ||
    (demoMode
      ? "DEMO-CYB-0001"
      : `${role === "SUPER_ADMIN" ? "GOV-00" : "GOV-01"}-${fullName
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}`);

  // Code-first lookup, email fallback. A code/email divergence fails
  // closed below; the requested code is never silently ignored.
  const byCode = await findOfficerByCode(sb, officerCode);
  const byEmail = await findOfficerByEmail(sb, email);
  if (byCode && byEmail && byCode.id !== byEmail.id) {
    fail(
      `GOV_SEED_CODE (${byCode.officer_code}) and GOV_SEED_EMAIL resolve to different officers; refusing.`,
    );
  }
  const existing = byCode ?? byEmail ?? null;
  let storedCode = officerCode;

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
    // Identity-only update: full name + official email. Role, scope,
    // jurisdiction, department, and status are preserved (privilege
    // changes are out of scope for this script). The officer_code is
    // never modified, and MFA factors / recovery codes are never touched.
    if (checkedCode.code && existing.officer_code.toUpperCase() !== checkedCode.code) {
      fail(
        `GOV_SEED_CODE ${checkedCode.code} does not match the stored code ${existing.officer_code}; refusing.`,
      );
    }

    // Email-collision guard: the new email must not belong to anyone else.
    if ((existing.official_email || "").toLowerCase() !== email) {
      const clash = await findOfficerByEmail(sb, email);
      if (clash && clash.id !== existing.id) {
        fail(`GOV_SEED_EMAIL is already assigned to ${clash.officer_code}; refusing.`);
      }
    }

    // Never resurrect a deliberately revoked credential.
    const { data: existingCred, error: credReadError } = await sb
      .from("gov_credentials")
      .select("cred_status")
      .eq("officer_id", existing.id)
      .maybeSingle();
    if (credReadError) fail(`Failed to read credential state: ${credReadError.message}`);
    if (existingCred && existingCred.cred_status === "REVOKED") {
      fail(
        `Credential for ${existing.officer_code} is REVOKED; refusing to resurrect. Un-revoke explicitly before re-seeding.`,
      );
    }

    if (existing.status !== "ACTIVE") {
      console.warn(
        `seed-gov-officer: WARNING: officer status is ${existing.status}; preserving it (sign-in stays gated).`,
      );
    }

    const now = new Date().toISOString();
    const officerPatch = {
      full_name: fullName,
      official_email: email,
      updated_at: now,
      // Password rotation always invalidates sessions, even when nothing
      // else changed: stale sessions must never survive a re-seed.
      session_version: (existing.session_version || 0) + 1,
    };

    const { data: updated, error: updateError } = await sb
      .from("gov_officers")
      .update(officerPatch)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (updateError) fail(`Failed to update officer: ${updateError.message}`);
    credentialRow.officer_id = updated.id;
    storedCode = updated.officer_code;

    // Belt-and-braces alongside the version bump above (stale rows fail
    // validation regardless). A stamp failure fails loudly so the operator
    // re-runs to confirm instead of assuming revocation completed.
    const { error: revokeError } = await sb
      .from("gov_sessions")
      .update({ revoked_at: now, revoke_reason: "bootstrap_credential_change" })
      .eq("officer_id", updated.id)
      .is("revoked_at", null);
    if (revokeError) {
      fail(
        `Officer and credential updated, but failed to stamp revoked sessions: ${revokeError.message}. ` +
          `Stale sessions already fail validation via the version bump; re-run to confirm the stamp.`,
      );
    }
    console.log(`seed-gov-officer: credential rotated — bumped session_version to ${officerPatch.session_version} and revoked live sessions.`);
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
    storedCode = created.officer_code;
  }

  const { error: credentialError } = await sb
    .from("gov_credentials")
    .upsert(credentialRow, { onConflict: "officer_id" });
  if (credentialError) fail(`Failed to set credential: ${credentialError.message}`);

  console.log("seed-gov-officer: done.");
  console.log(`  officer   : ${credentialRow.officer_id}`);
  console.log(`  email     : ${email}`);
  console.log(`  code      : ${storedCode} (stored officer code)`);
  console.log(`  role      : ${role}`);
  console.log(`  scope     : ${scope}${state ? ` / state ${state}` : ""}${district ? ` / district ${district}` : ""}`);
  console.log("  password  : (not printed; set via GOV_SEED_PASSWORD)");
  if (demoMode) {
    console.log("  demo      : SIH demonstration account — least-privilege, DEMO jurisdiction.");
    console.log("  next      : provision MFA with scripts/gov-enroll-mfa.cjs, then sign in at /gov/login.");
    console.log("  disable   : update gov_officers set status='REVOKED' where officer_code='<code>' and bump session_version.");
  } else {
    console.log("  next      : provision MFA for this officer (scripts/gov-enroll-mfa.cjs) before sign-in.");
  }
})();