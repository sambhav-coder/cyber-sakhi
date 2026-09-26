import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovAccessScopeView } from "@/components/gov/GovAccessScopeView";

export const metadata = {
  title: "Access and Scope",
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const context = await requireGovPage();
  const { officer } = context;
  return (
    <GovDashboardShell context={context} activeLabel="Access and Scope">
      <GovAccessScopeView
        officer={{
          officer_code: officer.officer_code,
          full_name: officer.full_name,
          official_email: officer.official_email,
          role: officer.role,
          scope: officer.scope,
          state_code: officer.state_code,
          district_code: officer.district_code,
          department: officer.department,
          status: officer.status,
        }}
        mfaFresh={context.mfaFresh}
      />
    </GovDashboardShell>
  );
}
