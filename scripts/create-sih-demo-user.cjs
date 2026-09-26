/**
 * Create SIH Demo User with specific Sakhi Number
 * 
 * This script creates the SIH demo user account with the exact Sakhi number
 * SAKHI-2026-DSAX as specified by the project owner.
 * 
 * Usage:
 *   node scripts/create-sih-demo-user.cjs
 * 
 * The password will be set from environment variable SIH_DEMO_PASSWORD
 * or a secure default will be used.
 */

const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
  console.error(`create-sih-demo-user: ${message}`);
  process.exit(1);
}

(async () => {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) fail("Missing Supabase URL/service-role key in .env.local.");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  // SIH Demo User Configuration
  const DEMO_SAKHI_NUMBER = "SAKHI-2026-DSAX";
  const DEMO_EMAIL = "dhairya.sharma.01315616124@adgips.ac.in";
  const DEMO_NAME = "SIH Demo User";
  const DEMO_PASSWORD = env.SIH_DEMO_PASSWORD;
  if (!DEMO_PASSWORD) {
  fail("SIH_DEMO_PASSWORD is required. Set it in .env.local before creating the SIH demo user.");
  }
  const DEMO_ROLE = "USER"; // Normal user role, not admin or government

  console.log("Creating SIH Demo User...");
  console.log(`Sakhi Number: ${DEMO_SAKHI_NUMBER}`);
  console.log(`Email: ${DEMO_EMAIL}`);
  console.log(`Name: ${DEMO_NAME}`);
  console.log(`Role: ${DEMO_ROLE}`);
  console.log(`Password: (set from environment or secure default)`);

  // Check if user already exists
  const { data: existingByEmail, error: emailError } = await sb
    .from("profiles")
    .select("*")
    .eq("email", DEMO_EMAIL.toLowerCase())
    .maybeSingle();

  if (emailError) fail(`Error checking existing user: ${emailError.message}`);

  if (existingByEmail) {
    console.log(`User with email ${DEMO_EMAIL} already exists.`);
    console.log(`Existing Sakhi Number: ${existingByEmail.sakhi_number}`);
    
    if (existingByEmail.sakhi_number === DEMO_SAKHI_NUMBER) {
      console.log("User already has the correct Sakhi Number. Updating password...");
      
      const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
      const { error: updateError } = await sb
        .from("profiles")
        .update({ password_hash: passwordHash })
        .eq("id", existingByEmail.id);
      
      if (updateError) fail(`Failed to update password: ${updateError.message}`);
      console.log("Password updated successfully.");
      process.exit(0);
    } else {
      fail(`User exists but has different Sakhi Number. Manual intervention required.`);
    }
  }

  // Check if Sakhi Number is already taken
  const { data: existingBySakhi, error: sakhiError } = await sb
    .from("profiles")
    .select("*")
    .eq("sakhi_number", DEMO_SAKHI_NUMBER)
    .maybeSingle();

  if (sakhiError) fail(`Error checking Sakhi Number: ${sakhiError.message}`);

  if (existingBySakhi) {
    fail(`Sakhi Number ${DEMO_SAKHI_NUMBER} is already assigned to another user: ${existingBySakhi.email}`);
  }

  // Create Supabase Auth user
  const { data: authUser, error: authError } = await sb.auth.admin.createUser({
    email: DEMO_EMAIL.toLowerCase(),
    password: crypto.randomBytes(24).toString("base64"), // Throwaway password for auth
    email_confirm: true,
    user_metadata: {
      full_name: DEMO_NAME,
    },
  });

  if (authError) {
    if (authError.code === "email_exists") {
      // Try to recover existing auth user
      const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 });
      const found = (users?.users || []).find(
        (u) => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase()
      );
      if (found?.id) {
        console.log("Recovered existing auth user:", found.id);
      } else {
        fail(`Auth user with email already exists but could not be recovered.`);
      }
    } else {
      fail(`Failed to create auth user: ${authError.message}`);
    }
  }

  const userId = authUser?.user?.id || (await sb.auth.admin.listUsers()).users.find(u => u.email?.toLowerCase() === DEMO_EMAIL.toLowerCase())?.id;
  if (!userId) fail("Could not determine user ID.");

  // Hash the actual password for application authentication
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Create profile with specific Sakhi Number
  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .insert({
      id: userId,
      email: DEMO_EMAIL.toLowerCase(),
      full_name: DEMO_NAME,
      role: "user", // Database stores lowercase
      password_hash: passwordHash,
      sakhi_number: DEMO_SAKHI_NUMBER,
      age: null,
      city: null,
      phone: null,
    })
    .select("*")
    .single();

  if (profileError) fail(`Failed to create profile: ${profileError.message}`);

  console.log("✓ SIH Demo User created successfully!");
  console.log(`  User ID: ${userId}`);
  console.log(`  Sakhi Number: ${profile.sakhi_number}`);
  console.log(`  Email: ${profile.email}`);
  console.log(`  Name: ${profile.full_name}`);
  console.log(`  Role: ${profile.role}`);
  console.log("");
  console.log("IMPORTANT: Set SIH_DEMO_PASSWORD in .env.local to the password you want to use.");
  console.log("Current password from environment:", "(set from environment)");
})();
