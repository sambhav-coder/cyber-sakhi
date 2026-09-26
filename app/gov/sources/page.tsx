import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovDataSourcesView } from "@/components/gov/GovDataSourcesView";

export const metadata = {
  title: "Data Sources",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  // Source transparency is visible to every authenticated officer; the
  // production block inside re-checks case-metrics permission client-side
  // against the guarded API (403 yields an honest locked note).
  const context = await requireGovPage();
  return (
    <GovDashboardShell context={context} activeLabel="Data Sources">
      <GovDataSourcesView />
    </GovDashboardShell>
  );
}
