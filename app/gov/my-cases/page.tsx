import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovCaseExplorer } from "@/components/gov/GovCaseExplorer";

export const metadata = {
  title: "My Assigned Cases",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("case.view_meta");
  return (
    <GovDashboardShell context={context} activeLabel="My Assigned Cases">
      <GovCaseExplorer fixedOfficerId={context.officer.id} />
    </GovDashboardShell>
  );
}
