import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Keep-alive permission boundaries (static verification).
 *
 * Security architecture decision (verified against this repo + Supabase docs):
 * - A dedicated database role is NOT the safest practical option here.
 *   Supabase PostgREST exposes only `anon`/`authenticated` via the
 *   publishable key; a custom role would require minting and storing a
 *   custom JWT signer secret in GitHub Actions — more secret material, more
 *   machinery, zero permission benefit. The verified alternative is the
 *   built-in `anon` role scoped by (a) Postgres default privileges (anon
 *   holds no grants on any application table — see "app posture" test
 *   below), plus (b) an explicit REVOKE ALL + GRANT SELECT ONLY on the
 *   single dedicated heartbeat table, plus (c) FORCED RLS with exactly one
 *   SELECT policy. The bot therefore cannot write anywhere and cannot read
 *   any application table.
 * - The one-time migration runs under the owner's authorized access in the
 *   Supabase SQL Editor. That owner access is NEVER given to the bot: the
 *   workflow receives only SUPABASE_URL + SUPABASE_ANON_KEY.
 */

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

function readMigrations(): { name: string; content: string }[] {
  const dir = path.join(process.cwd(), "supabase", "migrations");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((name) => ({
      name,
      content: fs.readFileSync(path.join(dir, name), "utf8"),
    }));
}

describe("Keep-alive bot cannot write anywhere", () => {
  it("workflow performs exactly one GET and no write-callable request", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    // Single GET is the only HTTP call shape present.
    expect(workflow).toContain("supabase_keepalive_heartbeat?select=id,heartbeat_at&limit=1");
    expect(workflow).not.toMatch(/-X\s+(POST|PUT|PATCH|DELETE)/i);
    expect(workflow).not.toMatch(/--data/i);
    expect(workflow).not.toMatch(/\.insert\s*\(/);
    expect(workflow).not.toMatch(/\.update\s*\(/);
    expect(workflow).not.toMatch(/\.delete\s*\(/);
    expect(workflow).not.toMatch(/\.upsert\s*\(/);
    // No retry loop: one attempt per run by design.
    expect(workflow).not.toMatch(/for\s+.*in\s+.*retry/i);
    expect(workflow).not.toMatch(/while\s+(true|:)/);
  });

  it("workflow never touches the Management API, auth admin, or login", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    expect(workflow).not.toMatch(/api\.supabase\.com/);
    expect(workflow).not.toMatch(/\/auth\/v1\/admin/);
    expect(workflow).not.toMatch(/\/auth\/v1\/token/);
    expect(workflow).not.toMatch(/sign[_-]?in/i);
  });

  it("migration never updates the heartbeat timestamp (no fake activity)", () => {
    const migration = readRepoFile(
      "supabase",
      "migrations",
      "supabase_keepalive_heartbeat.sql"
    );
    // The seed row is insert-if-absent; nothing ever rewrites heartbeat_at.
    // (Prose comments name forbidden operations to prohibit them, so match
    // operational statement shapes, not bare words.)
    expect(migration).toContain("ON CONFLICT (id) DO NOTHING");
    expect(migration).not.toMatch(/^\s*UPDATE\s+/m);
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/m);
  });

  it("migration creates and touches ONLY the heartbeat resource", () => {
    const migration = readRepoFile(
      "supabase",
      "migrations",
      "supabase_keepalive_heartbeat.sql"
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.supabase_keepalive_heartbeat");
    // Exactly one CREATE TABLE; no ALTER/DROP/policy changes on app tables.
    const creates = migration.match(/CREATE TABLE/gi) || [];
    expect(creates.length).toBe(1);
    expect(migration).not.toMatch(/ALTER TABLE public\.(?!supabase_keepalive_heartbeat)/i);
    expect(migration).not.toMatch(/DROP TABLE/i);
    expect(migration).not.toMatch(/DROP POLICY IF EXISTS (?!supabase_keepalive_heartbeat)/i);
  });

  it("migration enforces RLS deny-by-default with exactly one SELECT policy", () => {
    const migration = readRepoFile(
      "supabase",
      "migrations",
      "supabase_keepalive_heartbeat.sql"
    );
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    const policies = migration.match(/CREATE POLICY/gi) || [];
    expect(policies.length).toBe(1);
    expect(migration).toMatch(/FOR SELECT/);
    expect(migration).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/i);
    // Least-privileged grantees only; nothing granted to PUBLIC.
    expect(migration).not.toMatch(/GRANT\s+\S+\s+ON\s+\S+\s+TO\s+public/i);
    expect(migration).not.toMatch(/GRANT\s+(ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER)\b/i);
  });

  it("no other migration grants anon/authenticated any access (app posture)", () => {
    const others = readMigrations().filter(
      (m) => m.name !== "supabase_keepalive_heartbeat.sql"
    );
    expect(others.length).toBeGreaterThan(0);
    for (const m of others) {
      expect(
        m.content,
        `${m.name} must not grant access to anon`
      ).not.toMatch(/GRANT\s+.+\s+TO\s+anon/i);
      expect(
        m.content,
        `${m.name} must not grant access to authenticated`
      ).not.toMatch(/GRANT\s+.+\s+TO\s+authenticated/i);
    }
  });

  it("bot query selects only the minimum static columns", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    expect(workflow).toContain("select=id,heartbeat_at&limit=1");
    expect(workflow).not.toMatch(/select=\*/);
  });

  it("workflow exits non-zero unless a real database row is returned", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    // PASS requires HTTP 200 AND the row payload; every other path exits 1.
    expect(workflow).toContain('grep -q \'"id"\'');
    const failures = workflow.match(/exit 1/g) || [];
    expect(failures.length).toBeGreaterThanOrEqual(4);
  });

  it("local check script never prints credentials or response bodies", () => {
    const script = readRepoFile("scripts", "supabase-keepalive-check.mjs");
    expect(script).toContain('method: "GET"');
    expect(script).toContain("supabase_keepalive_heartbeat?select=id,heartbeat_at&limit=1");
    expect(script).not.toMatch(/console\.(log|error)\(.*(anonKey|ANON_KEY|apikey|Authorization|url|endpoint|payload|BODY)/);
    expect(script).not.toMatch(/process\.env\.SUPABASE_ANON_KEY\s*\}\s*`/);
    expect(script).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
    expect(script).not.toMatch(/SERVICE_ROLE|SECRET_KEY|Management/i);
  });

  it("schedule runs twice daily ~12h apart with manual dispatch and short timeout", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    expect(workflow).toContain('cron: "0 2 * * *"');
    expect(workflow).toContain('cron: "0 14 * * *"');
    expect(workflow).toContain("workflow_dispatch");
    expect(workflow).toContain("timeout-minutes: 2");
    expect(workflow).toContain("--max-time 20");
  });
});
