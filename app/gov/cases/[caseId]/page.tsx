import { requireGovPage } from "@/lib/gov/govGuard";
import { GovInvestigationWorkspace } from "@/components/gov/GovInvestigationWorkspace";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: { caseId: string } }) { await requireGovPage("case.view"); return <GovInvestigationWorkspace caseId={params.caseId} />; }
