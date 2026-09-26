import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Location-privacy regression suite (§8): row-level cases ride the
 * district drill-down only for officers who may also open them in the
 * Case Explorer. geo.view-only roles receive aggregates with no case rows.
 * DB-free static checks pinning the server strip + the client gate.
 */

const ROOT = process.cwd();
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), "utf8");

describe("gov geography case-row privacy gate", () => {
  it("strips cases server-side for roles without case.view_meta", () => {
    const text = read("app", "gov", "api", "geo", "route.ts");
    expect(text).toContain("case.view_meta");
    expect(text).toContain("roleHasDefaultPermission");
    // Aggregate-only shape for unprivileged callers: cases destructured out.
    expect(text).toMatch(/cases:\s*_stripped/);
  });

  it("gates the drill-down case table on a fail-closed canViewCases prop", () => {
    const text = read("components", "gov", "GovGeographyView.tsx");
    expect(text).toContain("canViewCases = false");
    expect(text).toContain("canViewCases ?");
  });

  it("passes the role-derived gate from the geography page", () => {
    const text = read("app", "gov", "geography", "page.tsx");
    expect(text).toContain("canViewCases");
    expect(text).toContain("case.view_meta");
  });
});
