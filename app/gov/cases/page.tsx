import { requireGovPage } from "@/lib/gov/govGuard";
import { GovCaseExplorer } from "@/components/gov/GovCaseExplorer";
export const dynamic = "force-dynamic";
export default async function Page(){await requireGovPage("case.view_meta"); return <GovCaseExplorer/>;}
