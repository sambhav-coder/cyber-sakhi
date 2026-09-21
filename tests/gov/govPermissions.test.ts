import { describe, expect, it } from "vitest";
import type { GovPermission, GovRole } from "../../lib/gov/govTypes";
import {
  GOV_PERMISSION_CATALOGUE,
  GOV_ROLE_DEFAULTS,
  RESTRICTED_PERMISSIONS,
  getDefaultPermissionsForRole,
  isRestrictedPermission,
  roleHasDefaultPermission,
} from "../../lib/gov/govPermissions";

const ALL_ROLES: GovRole[] = [
  "SUPER_ADMIN",
  "STATE_ADMIN",
  "DISTRICT_OFFICER",
  "INVESTIGATOR",
  "ANALYST",
  "AUDITOR",
];

const EXPECTED_CATALOGUE: GovPermission[] = [
  "case.view_meta",
  "case.view",
  "case.view_pii",
  "case.note",
  "case.update",
  "case.severity",
  "case.status",
  "case.assign",
  "case.reassign",
  "case.close",
  "case.reopen",
  "evidence.list",
  "evidence.view",
  "evidence.view_content",
  "evidence.download",
  "evidence.verify",
  "coc.view",
  "indicator.view",
  "indicator.correlate",
  "analytics.view",
  "geo.view",
  "report.generate",
  "report.export",
  "audit.view",
  "audit.export",
  "officer.view",
  "officer.create",
  "officer.suspend",
  "role.manage",
  "scope.manage",
  "policy.view",
  "break_glass.request",
  "break_glass.approve",
  "session.revoke",
];

describe("gov permission catalogue", () => {
  it("contains exactly the approved 34 permissions with no duplicates", () => {
    expect([...GOV_PERMISSION_CATALOGUE].sort()).toEqual([...EXPECTED_CATALOGUE].sort());
    expect(new Set(GOV_PERMISSION_CATALOGUE).size).toBe(34);
  });

  it("is immutable", () => {
    expect(Object.isFrozen(GOV_PERMISSION_CATALOGUE)).toBe(true);
  });
});

describe("gov role defaults", () => {
  it("has an explicit mapping for all six roles", () => {
    expect(Object.keys(GOV_ROLE_DEFAULTS).sort()).toEqual([...ALL_ROLES].sort());
    for (const role of ALL_ROLES) {
      expect(Array.isArray(getDefaultPermissionsForRole(role))).toBe(true);
    }
  });

  it("returns only valid catalogue permissions for every role", () => {
    const catalogue = new Set<GovPermission>(GOV_PERMISSION_CATALOGUE);
    for (const role of ALL_ROLES) {
      const defaults = getDefaultPermissionsForRole(role);
      expect(defaults.length).toBeGreaterThan(0);
      for (const permission of defaults) {
        expect(catalogue.has(permission)).toBe(true);
      }
      expect(new Set(defaults).size).toBe(defaults.length);
    }
  });

  it("checks valid permissions correctly", () => {
    expect(roleHasDefaultPermission("STATE_ADMIN", "case.assign")).toBe(true);
    expect(roleHasDefaultPermission("INVESTIGATOR", "evidence.download")).toBe(true);
    expect(roleHasDefaultPermission("ANALYST", "geo.view")).toBe(true);
    expect(roleHasDefaultPermission("AUDITOR", "audit.view")).toBe(true);
    expect(roleHasDefaultPermission("DISTRICT_OFFICER", "case.view_pii")).toBe(true);
  });

  it("denies missing permissions by default", () => {
    expect(roleHasDefaultPermission("ANALYST", "case.view_pii")).toBe(false);
    expect(roleHasDefaultPermission("ANALYST", "evidence.download")).toBe(false);
    expect(roleHasDefaultPermission("AUDITOR", "case.view")).toBe(false);
    expect(roleHasDefaultPermission("INVESTIGATOR", "case.assign")).toBe(false);
    expect(roleHasDefaultPermission("INVESTIGATOR", "role.manage")).toBe(false);
    expect(roleHasDefaultPermission("DISTRICT_OFFICER", "case.assign")).toBe(false);
    expect(roleHasDefaultPermission("DISTRICT_OFFICER", "scope.manage")).toBe(false);
  });

  it("denies unsupported permission values safely", () => {
    const unsupported = "evidence.nuke" as unknown as GovPermission;
    for (const role of ALL_ROLES) {
      expect(roleHasDefaultPermission(role, unsupported)).toBe(false);
    }
    expect(isRestrictedPermission(unsupported)).toBe(false);
  });

  it("denies unknown roles safely", () => {
    const unknownRole = "FIELD_MARSHAL" as unknown as GovRole;
    expect(getDefaultPermissionsForRole(unknownRole)).toEqual([]);
    expect(
      roleHasDefaultPermission(unknownRole, "case.view" as GovPermission),
    ).toBe(false);
  });
});

describe("gov sensitive permissions", () => {
  it("restricts role.manage and scope.manage to SUPER_ADMIN", () => {
    expect(roleHasDefaultPermission("SUPER_ADMIN", "role.manage")).toBe(true);
    expect(roleHasDefaultPermission("SUPER_ADMIN", "scope.manage")).toBe(true);
    for (const role of ALL_ROLES.filter((r) => r !== "SUPER_ADMIN")) {
      expect(roleHasDefaultPermission(role, "role.manage")).toBe(false);
      expect(roleHasDefaultPermission(role, "scope.manage")).toBe(false);
    }
  });

  it("does not grant evidence download or report export broadly", () => {
    for (const role of ["STATE_ADMIN", "DISTRICT_OFFICER", "INVESTIGATOR"] as const) {
      expect(roleHasDefaultPermission(role, "evidence.download")).toBe(true);
      expect(roleHasDefaultPermission(role, "report.export")).toBe(true);
    }
    for (const role of ["SUPER_ADMIN", "ANALYST", "AUDITOR"] as const) {
      expect(roleHasDefaultPermission(role, "evidence.download")).toBe(false);
      expect(roleHasDefaultPermission(role, "report.export")).toBe(false);
    }
  });

  it("grants no role audit.export by default", () => {
    for (const role of ALL_ROLES) {
      expect(roleHasDefaultPermission(role, "audit.export")).toBe(false);
    }
  });

  it("keeps officer, session, and break-glass approval powers narrow", () => {
    expect(roleHasDefaultPermission("SUPER_ADMIN", "session.revoke")).toBe(true);
    expect(roleHasDefaultPermission("SUPER_ADMIN", "break_glass.approve")).toBe(true);
    expect(roleHasDefaultPermission("SUPER_ADMIN", "officer.create")).toBe(true);
    expect(roleHasDefaultPermission("SUPER_ADMIN", "officer.suspend")).toBe(true);
    expect(roleHasDefaultPermission("ANALYST", "officer.create")).toBe(false);
    expect(roleHasDefaultPermission("AUDITOR", "officer.suspend")).toBe(false);
    expect(roleHasDefaultPermission("INVESTIGATOR", "session.revoke")).toBe(false);
    expect(roleHasDefaultPermission("STATE_ADMIN", "break_glass.approve")).toBe(false);
    expect(roleHasDefaultPermission("STATE_ADMIN", "session.revoke")).toBe(false);
  });

  it("marks the restricted set explicitly", () => {
    for (const permission of [
      "role.manage",
      "scope.manage",
      "officer.create",
      "officer.suspend",
      "session.revoke",
      "break_glass.approve",
      "evidence.download",
      "report.export",
      "audit.export",
    ] as const) {
      expect(RESTRICTED_PERMISSIONS.has(permission)).toBe(true);
      expect(isRestrictedPermission(permission)).toBe(true);
    }
    expect(isRestrictedPermission("case.view")).toBe(false);
    expect(isRestrictedPermission("policy.view")).toBe(false);
  });
});

describe("SUPER_ADMIN is not unrestricted", () => {
  it("holds governance powers but no default investigation access", () => {
    const defaults = getDefaultPermissionsForRole("SUPER_ADMIN");
    expect(defaults.length).toBeLessThan(GOV_PERMISSION_CATALOGUE.length);
    for (const permission of [
      "case.view",
      "case.view_pii",
      "evidence.download",
      "evidence.view_content",
      "indicator.correlate",
      "report.export",
      "audit.export",
    ] as const) {
      expect(roleHasDefaultPermission("SUPER_ADMIN", permission)).toBe(false);
    }
  });
});

describe("gov helper purity and separation", () => {
  it("takes role/permission only and performs no scope evaluation", () => {
    expect(roleHasDefaultPermission.length).toBe(2);
    expect(getDefaultPermissionsForRole.length).toBe(1);
    expect(isRestrictedPermission.length).toBe(1);
  });

  it("is deterministic and side-effect-free", () => {
    const first = getDefaultPermissionsForRole("ANALYST");
    const second = getDefaultPermissionsForRole("ANALYST");
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    (first as GovPermission[]).push("case.view" as GovPermission);
    expect(getDefaultPermissionsForRole("ANALYST")).toEqual(second);
    expect(roleHasDefaultPermission("ANALYST", "case.view")).toBe(false);
  });
});
