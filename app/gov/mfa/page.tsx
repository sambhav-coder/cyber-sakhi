import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";
import { GovMfaManager } from "@/components/gov/GovMfaManager";

export const metadata = {
  title: "Authenticator (MFA)",
};

// Server-rendered session check on every request; unauthenticated officers
// are redirected to /gov/login by the guard. Backend routes additionally
// require fresh MFA before replacing an existing factor.
export const dynamic = "force-dynamic";

export default async function GovMfaPage() {
  const context = await requireGovPage();
  return (
    <GovDashboardShell context={context} activeLabel="Authenticator (MFA)">
      <GovMfaManager />
    </GovDashboardShell>
  );
}
