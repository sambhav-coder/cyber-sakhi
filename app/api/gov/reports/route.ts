import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govOfficerAuditActor, govReportDataset, recordGovExport, resolveGovScopeFilter } from "@/lib/gov/govQueries";
import { buildGovAuditEvent } from "@/lib/gov/govAudit";
import { persistGovAuditEvent } from "@/lib/gov/govAuditPersistence";
import { govJsonError } from "@/lib/gov/govHttp";
export const runtime = "nodejs";
const csv = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
function buildPdf(lines: string[]): Uint8Array {
  // Minimal standards-compliant, text-only PDF. Export content is derived from
  // the same scoped dataset as CSV; it contains no victim PII.
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "?");
  const body = lines.slice(0, 50).map((line, i) => `BT /F1 9 Tf 45 ${790 - i * 14} Td (${esc(line).slice(0, 130)}) Tj ET`).join("\n");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${body.length} >>\nstream\n${body}\nendstream`];
  let pdf = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = pdf.length; pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(o => `${String(o).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "report.generate"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams; const filters = { state: p.get("state"), district: p.get("district"), threatCategory: p.get("threat"), riskLevel: p.get("risk"), govStatus: p.get("status"), from: p.get("from"), to: p.get("to") };
 return NextResponse.json(await govReportDataset(await resolveGovScopeFilter(guard.context.officer), filters));
}
export async function POST(req: Request) {
 const guard = await requireGovApi(req, "report.export"); if (!guard.ok) return guard.response;
 const body = await req.json().catch(() => null) as { format?: unknown; filters?: Record<string, string | null> } | null;
 if (body?.format !== "CSV" && body?.format !== "PDF") return govJsonError(400, "BAD_REQUEST", "Export format must be CSV or PDF.");
 const filters = body.filters ?? {}; const dataset = await govReportDataset(await resolveGovScopeFilter(guard.context.officer), filters);
 const header = ["Case ID","Created","State","District","Threat category","Risk","Status","Source","Assigned officer"];
 const content = [header, ...dataset.rows.map(r => [r.caseNumber,r.createdAt,r.state,r.district,r.threatCategory,r.riskLevel,r.govStatus,r.caseSource,r.assignedOfficer])].map(row => row.map(csv).join(",")).join("\n");
 const isPdf = body.format === "PDF"; const output = isPdf ? buildPdf(["Cyber-Sakhi Government Case Report", `Generated: ${dataset.generatedAt}`, `Rows: ${dataset.rows.length}`, "", header.join(" | "), ...dataset.rows.map(r => [r.caseNumber,r.createdAt,r.state,r.district,r.threatCategory,r.riskLevel,r.govStatus,r.caseSource,r.assignedOfficer].join(" | "))]) : content;
 const checksum = crypto.createHash("sha256").update(output).digest("hex"); const filename = `cyber-sakhi-cases-${new Date().toISOString().slice(0,10)}.${isPdf ? "pdf" : "csv"}`;
 await recordGovExport({ officerId: guard.context.officer.id, reportType: "CASES", format: body.format, filters, scopedState: guard.context.officer.state_code, scopedDistrict: guard.context.officer.district_code, rowCount: dataset.rows.length, fileName: filename, checksum });
 const audit = buildGovAuditEvent({ action: "report.exported", actor: govOfficerAuditActor(guard.context.officer), permission: "report.export", result: "allow", correlationId: crypto.randomUUID(), payload: { format: body.format, rows: dataset.rows.length, filters } }); if (audit) await persistGovAuditEvent(audit, { swallow: true });
 return new NextResponse(output, { headers: { "Content-Type": isPdf ? "application/pdf" : "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } });
}
