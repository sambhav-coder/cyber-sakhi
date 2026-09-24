import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovQueueView } from "@/components/gov/GovOperationsViews";

export const metadata = {
  title: "Investigation Queue",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("case.view_meta");
  return (
    <GovDashboardShell context={context} activeLabel="Investigation Queue">
      <GovQueueView />
    </GovDashboardShell>
  );
}
