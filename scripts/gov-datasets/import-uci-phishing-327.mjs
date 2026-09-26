/**
 * Repeatable import: UCI Phishing Websites (id 327) -> research staging artifacts.
 *
 * Usage (PowerShell, from repo root):
 *   Invoke-WebRequest -Uri "https://archive.ics.uci.edu/static/public/327/phishing%2Bwebsites.zip" -OutFile "<tmp>/uci-phishing-327.zip"
 *   Expand-Archive <tmp>/uci-phishing-327.zip -DestinationPath <tmp>/uci-phishing-327
 *   node scripts/gov-datasets/import-uci-phishing-327.mjs --arff "<tmp>/uci-phishing-327/Training Dataset.arff" --zip-sha256 <hex> --out docs/datasets/uci-phishing-websites-327
 *
 * The script never touches production tables. Output: normalized.jsonl (one
 * JSON object per source row, original feature values preserved verbatim),
 * registry-entry.json (PART 4.4 metadata), transform.log. Fails non-zero on
 * validation errors. No secrets required.
 */

import { createHash } from "node:crypto";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] ?? ""]);
    return acc;
  }, []),
);

const ARFF = args.arff;
const OUT = args.out;
const ZIP_SHA = (args["zip-sha256"] ?? "").toUpperCase();
if (!ARFF || !OUT) {
  console.error("Usage: node import-uci-phishing-327.mjs --arff <path> --zip-sha256 <hex> --out <dir>");
  process.exit(2);
}

const EXPECTED_FEATURES = 30;
const TRANSFORM_VERSION = "uci327-v1";

const raw = await fs.readFile(ARFF, "utf8");
const lines = raw.split(/\r?\n/);
const attrLines = lines.filter((l) => l.toLowerCase().startsWith("@attribute"));
const dataStart = lines.findIndex((l) => l.trim().toLowerCase() === "@data");
if (dataStart === -1) throw new Error("ARFF has no @data section.");
const attrNames = attrLines.map((l) => l.split(/\s+/)[1]);
const dataLines = lines.slice(dataStart + 1).filter((l) => l.trim() && !l.trim().startsWith("%"));

const log = [];
const note = (m) => { log.push(m); console.log(m); };
note(`source arff: ${ARFF}`);
note(`attributes observed: ${attrNames.length} (expected 31 = 30 features + Result)`);
note(`data rows observed: ${dataLines.length}`);

const errors = [];
if (attrNames.length !== 31) errors.push(`attribute count ${attrNames.length} != 31`);
if (attrNames[attrNames.length - 1] !== "Result") errors.push(`last attribute is ${attrNames.at(-1)}, expected Result`);
const featureNames = attrNames.slice(0, -1);

const fileHash = createHash("sha256").update(raw).digest("hex").toUpperCase();
note(`arff sha256: ${fileHash}`);

let imported = 0;
let rejected = 0;
const rejectReasons = {};
const resultDist = { "-1": 0, "1": 0 };
const outDir = path.resolve(OUT);
await fs.mkdir(outDir, { recursive: true });
const out = createWriteStream(path.join(outDir, "normalized.jsonl"), "utf8");

dataLines.forEach((line, idx) => {
  const cells = line.trim().split(",");
  const fail = (reason) => {
    rejected += 1;
    rejectReasons[reason] = (rejectReasons[reason] ?? 0) + 1;
  };
  if (cells.length !== 31) return fail(`wrong-column-count@${idx + 1}`);
  const features = cells.slice(0, 30);
  const result = cells[30].trim();
  if (result !== "-1" && result !== "1") return fail(`bad-result@${idx + 1}`);
  for (const v of features) {
    const t = v.trim();
    if (t !== "-1" && t !== "0" && t !== "1") return fail(`bad-feature-value@${idx + 1}`);
  }
  imported += 1;
  resultDist[result] += 1;
  const obj = { row_id: `uci327-${String(idx + 1).padStart(5, "0")}` };
  const fmap = {};
  featureNames.forEach((n, i) => { fmap[n] = Number(features[i].trim()); });
  obj.features = fmap;
  obj.label_original = Number(result);
  obj.label_normalized = result === "-1" ? "PHISHING" : "LEGITIMATE";
  obj.label_basis = "UCI-327 Result column (-1=phishing, 1=legitimate per donor paper); feature 0 means suspicious per paper, kept verbatim";
  out.write(JSON.stringify(obj) + "\n");
});

await new Promise((res, rej) => { out.end((e) => (e ? rej(e) : res())); });

note(`imported: ${imported}, rejected: ${rejected} ${JSON.stringify(rejectReasons)}`);
note(`Result distribution: phishing(-1)=${resultDist["-1"]}, legitimate(1)=${resultDist["1"]}`);

const registryEntry = {
  source_name: "UCI Machine Learning Repository",
  source_url: "https://archive.ics.uci.edu/dataset/327/phishing%2Bwebsites",
  dataset_name: "Phishing Websites (id 327)",
  creators: ["Rami Mohammad", "Lee McCluskey"],
  citation_doi: "10.24432/C51W2X",
  version_date: "2015-03-25",
  download_timestamp: new Date().toISOString(),
  download_url: "https://archive.ics.uci.edu/static/public/327/phishing%2Bwebsites.zip",
  license: "CC BY 4.0 (attribution required)",
  original_files: ["Training Dataset.arff (800920 bytes)", ".old.arff", "Phishing Websites Features.docx"],
  file_checksum_sha256_zip: ZIP_SHA || "UNRECORDED-RERUN-WITH---zip-sha256",
  arff_checksum_sha256: fileHash,
  schema_version: "arff-31-attrs",
  import_status: rejected === 0 ? "complete" : "complete-with-rejections",
  source_rows: dataLines.length,
  imported_rows: imported,
  rejected_rows: rejected,
  rejection_reasons: rejectReasons,
  transform_version: TRANSFORM_VERSION,
  geographic_coverage: "none - URLs are global with no country/state fields; NOT usable for geographic mapping",
  date_coverage: "collected circa 2012-2015 (PhishTank/MillerSmiles archives of that era); HISTORICAL, not current",
  classification: "RESEARCH - never production cases, never government intelligence",
  target_mapping: { "-1": "PHISHING", "1": "LEGITIMATE" },
  missing_value_behavior: "dataset declares no missing values; any malformed line is rejected with reason, never imputed",
  privacy_handling: "no PII columns; URLs themselves are feature-encoded integers (-1/0/1), raw URLs not present",
  panel_mapping: {
    label_normalized: "research URL observation label for Indicator Intelligence research corpus",
    features: "30 verbatim structural features for research/demonstration only",
  },
  limitations: [
    "Historical (2012-2015 web); feature distributions do not represent the current threat landscape.",
    "Labels are research labels, not investigation verdicts or legal findings.",
    "No geography, no victim, no case linkage - must never appear in case counts, maps, or reports as cases.",
  ],
};

await fs.writeFile(path.join(outDir, "registry-entry.json"), JSON.stringify(registryEntry, null, 2) + "\n");
await fs.writeFile(path.join(outDir, "transform.log"), log.join("\n") + "\n");

if (errors.length > 0 || rejected > 0) {
  console.error("VALIDATION FAILURES:", errors);
  process.exit(1);
}
console.log(`OK: artifacts in ${outDir}`);
