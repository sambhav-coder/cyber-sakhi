import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovExternalIntelView } from "@/components/gov/GovExternalIntelView";

export const metadata = {
  title: "External Intelligence",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("indicator.view");
  return (
    <GovDashboardShell context={context} activeLabel="External Intelligence">
      <GovExternalIntelView />
    </GovDashboardShell>
  );
}
