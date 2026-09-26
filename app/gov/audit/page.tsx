import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovAuditCenter } from "@/components/gov/GovAuditCenter";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";

export const metadata = {
  title: "Audit Logs",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage("audit.view");
  const canExport = roleHasDefaultPermission(context.officer.role, "audit.export");
  return (
    <GovDashboardShell context={context} activeLabel="Audit Logs">
      <GovAuditCenter canExport={canExport} />
    </GovDashboardShell>
  );
}
