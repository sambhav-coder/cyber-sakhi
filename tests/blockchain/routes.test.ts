import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

/**
 * TEST 12: Frontend/backend route paths actually match.
 *
 * Verifies that every API path the Evidence Locker page calls has a real
 * Next.js route file behind it, and that the blockchain-facing routes exist
 * and are protected by middleware.
 */

const apiDir = join(process.cwd(), "app", "api");

function routeFileExists(relative: string): boolean {
  return existsSync(join(apiDir, relative, "route.ts"));
}

describe("frontend -> backend route matrix (TEST 12)", () => {
  it("evidence list / single routes exist", () => {
    expect(routeFileExists("evidence")).toBe(true);
  });

  it("evidence dynamic routes exist", () => {
    expect(routeFileExists("evidence/[id]")).toBe(true);
    expect(routeFileExists("evidence/[id]/anchor")).toBe(true);
    expect(routeFileExists("evidence/[id]/lock")).toBe(true);
    expect(routeFileExists("evidence/[id]/unlock")).toBe(true);
  });

  it("chain-of-custody route exists", () => {
    expect(routeFileExists("chain-of-custody")).toBe(true);
  });

  it("blockchain status route exists", () => {
    expect(routeFileExists("blockchain/status")).toBe(true);
  });

  it("batch anchor route exists", () => {
    expect(routeFileExists("anchor/batch")).toBe(true);
  });

  it("cases route used by the locker exists", () => {
    expect(routeFileExists("cases")).toBe(true);
    expect(routeFileExists("cases/[caseId]")).toBe(true);
  });
});

describe("middleware protects blockchain-facing routes", () => {
  const middlewarePath = join(process.cwd(), "middleware.ts");
  const source = readFileSync(middlewarePath, "utf8");

  it("PROTECTED_API_PREFIXES includes /api/blockchain and /api/chain-of-custody", () => {
    expect(source).toContain('"/api/blockchain"');
    expect(source).toContain('"/api/chain-of-custody"');
  });

  it("matcher includes the blockchain and chain-of-custody paths", () => {
    expect(source).toContain('"/api/blockchain/:path*"');
    expect(source).toContain('"/api/chain-of-custody/:path*"');
  });
});