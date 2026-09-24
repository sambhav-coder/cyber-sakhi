import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovEvidenceListView } from "@/components/gov/GovEvidenceListView";

export const metadata = {
  title: "Evidence & Chain of Custody",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("evidence.view");
  return (
    <GovDashboardShell context={context} activeLabel="Evidence & Chain of Custody">
      <GovEvidenceListView />
    </GovDashboardShell>
  );
}