import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readRepoFile(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

describe("Demo CTA label rename (Try SIH Demo -> Live)", () => {
  it("shows Live on the login demo button", () => {
    const content = readRepoFile("app", "login", "page.tsx");
    expect(content).toContain("<span>Live</span>");
  });

  it("does not show the old Try SIH Demo button label", () => {
    const content = readRepoFile("app", "login", "page.tsx");
    expect(content).not.toContain("Try SIH Demo");
  });

  it("preserves the existing demo-login handler and credentials flow", () => {
    const content = readRepoFile("app", "login", "page.tsx");
    // Exact existing click handler + demo identity must remain intact.
    expect(content).toContain("handleDemoLogin");
    expect(content).toContain("onClick={handleDemoLogin}");
    expect(content).toContain("SAKHI-2026-DSAX");
    expect(content).toContain("SIH_DEMO_AUTH_TOKEN");
  });
});

describe("Supabase keep-alive (read-only, least-privilege)", () => {
  it("workflow runs twice daily (~12h apart) with manual dispatch", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    expect(workflow).toContain('cron: "0 2 * * *"');
    expect(workflow).toContain('cron: "0 14 * * *"');
    expect(workflow).toContain("workflow_dispatch");
  });

  it("workflow performs one minimal read with a short timeout", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    expect(workflow).toContain("supabase_keepalive_heartbeat?select=id,heartbeat_at&limit=1");
    expect(workflow).toContain("timeout-minutes: 2");
    expect(workflow).toContain("--max-time 20");
  });

  it("workflow uses anon credentials only and never elevated keys", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    expect(workflow).toContain("secrets.SUPABASE_URL");
    expect(workflow).toContain("secrets.SUPABASE_ANON_KEY");
    // Operational use of elevated credentials is forbidden (prose may name
    // them only to explicitly prohibit them).
    expect(workflow).not.toMatch(/secrets\.SUPABASE_SERVICE_ROLE/i);
    expect(workflow).not.toMatch(/secrets\.SUPABASE_SECRET/i);
    expect(workflow).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY:\s*\$/);
    expect(workflow).not.toMatch(/SUPABASE_SECRET_KEY:\s*\$/);
    expect(workflow).not.toMatch(/api\.supabase\.com\/.*project/i);
  });

  it("workflow never performs writes or admin actions", () => {
    const workflow = readRepoFile(
      ".github",
      "workflows",
      "supabase-keepalive.yml"
    );
    // The query itself is a single GET; forbid write/admin HTTP verbs,
    // PostgREST write calls, and Supabase Management API endpoints (prose
    // may name the forbidden operations, so match operational patterns).
    expect(workflow).not.toMatch(/-X\s+(POST|PUT|PATCH|DELETE)/i);
    expect(workflow).not.toMatch(/\.insert\s*\(/);
    expect(workflow).not.toMatch(/\.update\s*\(/);
    expect(workflow).not.toMatch(/\.delete\s*\(/);
    expect(workflow).not.toMatch(/\/auth\/v1\/admin/);
    expect(workflow).not.toMatch(/api\.supabase\.com/);
  });

  it("migration creates an anon-SELECT-only heartbeat resource with RLS", () => {
    const migration = readRepoFile(
      "supabase",
      "migrations",
      "supabase_keepalive_heartbeat.sql"
    );
    expect(migration).toContain("supabase_keepalive_heartbeat");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("GRANT SELECT ON public.supabase_keepalive_heartbeat TO anon");
    expect(migration).toContain("FOR SELECT");
    expect(migration).toContain("USING (true)");
    // No write grants to least-privileged roles.
    expect(migration).not.toMatch(/GRANT\s+.*INSERT.*TO\s+anon/i);
    expect(migration).not.toMatch(/GRANT\s+.*UPDATE.*TO\s+anon/i);
    expect(migration).not.toMatch(/GRANT\s+.*DELETE.*TO\s+anon/i);
    expect(migration).not.toMatch(/GRANT\s+.*INSERT.*TO\s+authenticated/i);
    expect(migration).not.toMatch(/GRANT\s+.*UPDATE.*TO\s+authenticated/i);
    expect(migration).not.toMatch(/GRANT\s+.*DELETE.*TO\s+authenticated/i);
  });

  it("migration heartbeat resource holds no sensitive data", () => {
    const migration = readRepoFile(
      "supabase",
      "migrations",
      "supabase_keepalive_heartbeat.sql"
    );
    // The heartbeat table must expose only its static marker columns.
    // (Prose comments may mention forbidden concepts to prohibit them, so
    // assert on column definitions rather than whole-file substrings.)
    expect(migration).toContain("heartbeat_at");
    expect(migration).not.toMatch(/^\s*(email|password_hash|secret|token)\s+\w+/m);
  });

  it("local check script stays read-only and never touches elevated keys", () => {
    const script = readRepoFile("scripts", "supabase-keepalive-check.mjs");
    expect(script).toContain("supabase_keepalive_heartbeat?select=id,heartbeat_at&limit=1");
    expect(script).toContain('method: "GET"');
    expect(script).not.toMatch(/SERVICE_ROLE/i);
    expect(script).not.toMatch(/\bINSERT\b/);
    expect(script).not.toMatch(/\bDELETE\b/);
  });
});
