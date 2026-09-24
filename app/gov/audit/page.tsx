import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovDataView } from "@/components/gov/GovDataView";

export const metadata = {
  title: "Audit Logs",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("audit.view");
  return (
    <GovDashboardShell context={context} activeLabel="Audit Logs">
      <GovDataView
        title="Audit Logs"
        description="Immutable government access and workflow records."
        endpoint="/gov/api/audit?page=1&pageSize=50"
      />
    </GovDashboardShell>
  );
}
