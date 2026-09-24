import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovTrendsView } from "@/components/gov/GovOperationsViews";

export const metadata = {
  title: "Analytics & Trends",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("analytics.view");
  return (
    <GovDashboardShell context={context} activeLabel="Trends">
      <GovTrendsView />
    </GovDashboardShell>
  );
}
