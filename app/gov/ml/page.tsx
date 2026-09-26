import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovMlWorkspace } from "@/components/gov/GovMlWorkspace";

export const metadata = {
  title: "ML Intelligence",
};

export const dynamic = "force-dynamic";

// Visible to every authenticated officer: model card, evaluation, and the
// scoring demo use external/research artifacts only — no case data.
export default async function Page() {
  const context = await requireGovPage();
  return (
    <GovDashboardShell context={context} activeLabel="ML Intelligence">
      <GovMlWorkspace />
    </GovDashboardShell>
  );
}
