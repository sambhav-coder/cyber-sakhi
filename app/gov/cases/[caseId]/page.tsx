import { requireGovPage } from "@/lib/gov/govGuard";
import { GovDataView } from "@/components/gov/GovDataView";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: { caseId: string } }) { await requireGovPage("case.view"); return <GovDataView title="Investigation Workspace" description="Case details, forensic findings, evidence, custody timeline, and investigation notes are loaded only after scoped authorization." endpoint={`/api/gov/cases/${encodeURIComponent(params.caseId)}`} />; }
