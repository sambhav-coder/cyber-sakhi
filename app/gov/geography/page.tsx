import { requireGovPage } from "@/lib/gov/govGuard";
import { GovGeographyView } from "@/components/gov/GovGeographyView";
export const dynamic = "force-dynamic";
export default async function Page(){ await requireGovPage("geo.view"); return <GovGeographyView/>; }
