import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovOfficerDirectory } from "@/components/gov/GovOfficerDirectory";
import { govOfficerCandidates } from "@/lib/gov/govQueries";

export const metadata = {
  title: "Administration",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("officer.view");
  // Scope-filtered server-side: the viewer only ever receives officers
  // whose jurisdiction their own scope covers.
  const candidates = await govOfficerCandidates(context.officer).catch(() => []);
  return (
    <GovDashboardShell context={context} activeLabel="Administration">
      <GovOfficerDirectory
        initial={candidates.map((c) => ({
          officerCode: c.officerCode,
          fullName: c.fullName,
          role: c.role,
          scope: c.scope,
          stateCode: c.stateCode,
          districtCode: c.districtCode,
          department: c.department,
          status: c.status,
        }))}
      />
    </GovDashboardShell>
  );
}
