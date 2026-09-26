import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovDashboardView } from "@/components/gov/GovDashboardView";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import {
  govDashboardFilterOptions,
  govDashboardMetrics,
  govDashboardWindow,
  resolveGovScopeFilter,
  type GovDashboardMetrics as GovDashboardMetricsData,
} from "@/lib/gov/govQueries";

export const metadata = {
  title: "Overview",
};

// Server-rendered session check on every request; unauthenticated officers
// are redirected to /gov/login by the guard.
export const dynamic = "force-dynamic";

function emptySheet(scope: GovDashboardMetricsData["scope"] = {
  kind: "unattributed",
  label: "Scope unavailable",
  requiresAttribution: false,
}): GovDashboardMetricsData {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    window: { label: "7d", from: null, to: now },
    filters: { stateCode: null, districtCode: null },
    metrics: { total: 0, windowTotal: 0, new: 0, highRisk: 0, underInvestigation: 0, resolved: 0, open: 0, closed: 0, awaitingEvidence: 0, triageNeeded: 0, unassigned: 0, assignedToMe: 0 },
    threatDistribution: [],
    riskDistribution: [],
    statusDistribution: [],
    scope,
  };
}

export default async function GovDashboardPage() {
  const context = await requireGovPage();
  const { officer } = context;

  // Officers without case-metrics permission still see the shell; the view
  // renders its locked state. No scoped query runs for them here.
  const canReadCases = roleHasDefaultPermission(officer.role, "case.view_meta");

  let initial: GovDashboardMetricsData = emptySheet();
  let options: { states: string[]; districts: string[] } = { states: [], districts: [] };
  // A failed server fetch must NEVER render as zeros. initialError forces the
  // view into an explicit "temporarily unavailable" state until a live
  // client-side refresh succeeds.
  let initialError: string | null = null;

  if (canReadCases) {
    try {
      const scope = await resolveGovScopeFilter(officer);
      const window = govDashboardWindow("7d");
      const [metrics, filterOptions] = await Promise.all([
        govDashboardMetrics(scope, { window, officerId: officer.id }),
        govDashboardFilterOptions(scope, null),
      ]);
      initial = metrics;
      options = filterOptions;
    } catch {
      initial = emptySheet();
      options = { states: [], districts: [] };
      initialError = "Production case data is temporarily unavailable. Retry below — zeros are not shown for failed queries.";
    }
  }

  return (
    <GovDashboardShell context={context} activeLabel="Overview">
      <GovDashboardView
        officer={{
          id: officer.id,
          role: officer.role,
          scope: officer.scope,
          state_code: officer.state_code,
          district_code: officer.district_code,
          full_name: officer.full_name,
          official_email: officer.official_email,
          department: officer.department,
          officer_code: officer.officer_code,
        }}
        options={options}
        initial={initial}
        initialError={initialError}
      />
    </GovDashboardShell>
  );
}
