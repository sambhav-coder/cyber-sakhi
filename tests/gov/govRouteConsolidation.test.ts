import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GOV_SESSION_COOKIE_PATH } from "../../lib/gov/govCookie";

/**
 * Route-consolidation regression suite (DB-free static checks).
 *
 * The government session cookie is scoped to Path=/gov, so every
 * authenticated data route must live under app/gov/api/* where browsers
 * actually deliver the cookie. These tests pin that invariant:
 * moved routes exist, old paths are gone, frontend calls the new paths,
 * guards moved with the code, and the cookie was never widened.
 */

const ROOT = process.cwd();
const govApi = (...parts: string[]) => join(ROOT, "app", "gov", "api", ...parts);
const oldApi = (...parts: string[]) => join(ROOT, "app", "api", "gov", ...parts);
const component = (name: string) => join(ROOT, "components", "gov", name);
const govPage = (...parts: string[]) => join(ROOT, "app", "gov", ...parts);

function collectRouteFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** The 16 real implementations, by path relative to the gov api root. */
const MOVED_ROUTES = [
  "audit/route.ts",
  "cases/route.ts",
  "cases/[caseId]/route.ts",
  "cases/[caseId]/assignment/route.ts",
  "cases/[caseId]/evidence/route.ts",
  "cases/[caseId]/location/route.ts",
  "cases/[caseId]/notes/route.ts",
  "cases/[caseId]/victim/route.ts",
  "current-events/route.ts",
  "cyber-news/route.ts",
  "evidence/[evidenceId]/route.ts",
  "geo/route.ts",
  "indicators/route.ts",
  "queue/route.ts",
  "reports/route.ts",
  "trends/route.ts",
];

/** The 5 deleted re-export shims, by old relative path. */
const DELETED_SHIMS = [
  "dashboard/route.ts",
  "dashboard/filters/route.ts",
  "login/route.ts",
  "logout/route.ts",
  "session/route.ts",
];

/** Frontend files whose only gov-data paths must now sit under /gov/api. */
const FRONTEND_SCOPE = [
  component("GovCaseExplorer.tsx"),
  component("GovCurrentEvents.tsx"),
  component("GovCyberNews.tsx"),
  component("GovGeographyView.tsx"),
  component("GovInvestigationWorkspace.tsx"),
  component("GovOperationsViews.tsx"),
  govPage("audit", "page.tsx"),
  govPage("reports", "page.tsx"),
];

/** Moved route -> permissions that must textually survive the move. */
const ROUTE_PERMISSIONS: Array<{ route: string; permissions: string[] }> = [
  { route: "audit/route.ts", permissions: ["audit.view"] },
  { route: "cases/route.ts", permissions: ["case.view_meta"] },
  { route: "cases/[caseId]/route.ts", permissions: ["case.view", "case.update"] },
  { route: "cases/[caseId]/assignment/route.ts", permissions: ["case.assign"] },
  { route: "cases/[caseId]/evidence/route.ts", permissions: ["evidence.list"] },
  { route: "cases/[caseId]/location/route.ts", permissions: ["case.view_pii"] },
  { route: "cases/[caseId]/notes/route.ts", permissions: ["case.view", "case.note"] },
  { route: "cases/[caseId]/victim/route.ts", permissions: ["case.view_pii"] },
  { route: "evidence/[evidenceId]/route.ts", permissions: ["evidence.view"] },
  { route: "geo/route.ts", permissions: ["geo.view"] },
  { route: "indicators/route.ts", permissions: ["indicator.view"] },
  { route: "queue/route.ts", permissions: ["case.view_meta"] },
  { route: "reports/route.ts", permissions: ["report.generate", "report.export"] },
  { route: "trends/route.ts", permissions: ["analytics.view"] },
];

describe("gov route consolidation", () => {
  it("hosts all 16 moved data routes under app/gov/api/*", () => {
    for (const route of MOVED_ROUTES) {
      expect(existsSync(govApi(route)), `missing moved route: ${route}`).toBe(true);
    }
  });

  it("removed the 5 old re-export shims and leaves no route.ts under app/api/gov", () => {
    for (const shim of DELETED_SHIMS) {
      expect(existsSync(oldApi(shim)), `stale shim still present: ${shim}`).toBe(false);
    }
    expect(collectRouteFiles(join(ROOT, "app", "api", "gov"))).toEqual([]);
  });

  it("keeps no /api/gov references in the approved frontend scope", () => {
    for (const file of FRONTEND_SCOPE) {
      const text = readFileSync(file, "utf8");
      expect(text.includes("/api/gov"), `stale /api/gov reference in ${file}`).toBe(false);
    }
  });

  it("keeps the session cookie scoped to Path=/gov (never broadened)", () => {
    expect(GOV_SESSION_COOKIE_PATH).toBe("/gov");
  });

  it("retains guard + permission checks in every moved protected route", () => {
    for (const { route, permissions } of ROUTE_PERMISSIONS) {
      const text = readFileSync(govApi(route), "utf8");
      expect(
        text.includes("requireGovApi") || text.includes("guardGovApiRequest"),
        `${route} lost its authentication guard`,
      ).toBe(true);
      for (const permission of permissions) {
        expect(text.includes(`"${permission}"`), `${route} lost permission ${permission}`).toBe(true);
      }
    }
  });

  it("keeps current-events and cyber-news guard-free exactly as before", () => {
    for (const route of ["current-events/route.ts", "cyber-news/route.ts"]) {
      const text = readFileSync(govApi(route), "utf8");
      expect(text.includes("requireGovApi"), `${route} gained an unexpected guard`).toBe(false);
      expect(text.includes("guardGovApiRequest"), `${route} gained an unexpected guard`).toBe(false);
    }
  });

  it("retains case.view_pii on victim/location and report.export on reports", () => {
    expect(readFileSync(govApi("cases/[caseId]/victim/route.ts"), "utf8")).toContain("case.view_pii");
    expect(readFileSync(govApi("cases/[caseId]/location/route.ts"), "utf8")).toContain("case.view_pii");
    expect(readFileSync(govApi("reports/route.ts"), "utf8")).toContain("report.export");
  });
});
