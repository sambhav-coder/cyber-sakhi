import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovIndicatorView } from "@/components/gov/GovOperationsViews";

export const metadata = {
  title: "Indicator Intelligence",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("indicator.view");
  return (
    <GovDashboardShell context={context} activeLabel="Indicator Intelligence">
      <GovIndicatorView />
    </GovDashboardShell>
  );
}
