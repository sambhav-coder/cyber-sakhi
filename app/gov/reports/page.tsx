import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovReportsArchive } from "@/components/gov/GovReportsArchive";

export const metadata = {
  title: "Reports",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("report.generate");
  return (
    <GovDashboardShell context={context} activeLabel="Reports">
      <GovReportsArchive officerName={context.officer.full_name} officerCode={context.officer.officer_code} />
    </GovDashboardShell>
  );
}
