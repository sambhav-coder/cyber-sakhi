import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovGeographyView } from "@/components/gov/GovGeographyView";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";

export const metadata = {
  title: "Map",
};

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams?: { state?: string } }) {
  const context = await requireGovPage("geo.view");
  // Case rows ride the district drill-down only for officers who may also
  // open them in the Case Explorer (enforced again server-side in the
  // geo route). Aggregate geography stays visible to all geo.view holders.
  const canViewCases = roleHasDefaultPermission(context.officer.role, "case.view_meta");
  // Drill state survives refresh via ?state= (validated against loaded
  // geometry client-side; unknown values fall back to the India view).
  const rawState = typeof searchParams?.state === "string" ? searchParams.state.trim().slice(0, 120) : "";
  return (
    <GovDashboardShell context={context} activeLabel="Map">
      <GovGeographyView canViewCases={canViewCases} initialSelected={rawState || null} />
    </GovDashboardShell>
  );
}
