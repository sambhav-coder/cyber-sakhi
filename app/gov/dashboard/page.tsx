import React from "react";
import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDashboardShell } from "@/components/gov/GovDashboardShell";

export const metadata = {
  title: "Overview",
};

// Server-rendered session check on every request; unauthenticated officers
// are redirected to /gov/login by the guard.
export const dynamic = "force-dynamic";

export default async function GovDashboardPage() {
  const context = await requireGovPage();
  return <GovDashboardShell context={context} />;
}