import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovDataView } from "@/components/gov/GovDataView";

export const metadata = {
  title: "Reports",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("report.generate");
  return (
    <GovDashboardShell context={context} activeLabel="Reports">
      <GovDataView
        title="Reports"
        description="Live scoped report preview. CSV exports are recorded in the audit ledger."
        endpoint="/gov/api/reports"
      />
    </GovDashboardShell>
  );
}
