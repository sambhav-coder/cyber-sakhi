# UCI Phishing Websites (id 327) — research staging notes

- Source: UCI Machine Learning Repository, https://archive.ics.uci.edu/dataset/327/phishing%2Bwebsites
- Creators: Rami Mohammad, Lee McCluskey. DOI: 10.24432/C51W2X. Donated 2015-03-25.
- License: **CC BY 4.0** (attribution required — given here and in the panel Sources view).
- Collected from: PhishTank archive, MillerSmiles archive, Google search operators (circa 2012–2015).
- Classification: **RESEARCH**. Historical URL-feature corpus. Not cases, not intelligence, not current.

## Reproduce (repeatable)

```powershell
Invoke-WebRequest -Uri "https://archive.ics.uci.edu/static/public/327/phishing%2Bwebsites.zip" -OutFile "<tmp>/uci-phishing-327.zip"
# zip sha256 must be 514F582CB44CBA17251BAF1D59F64CDDFF16EFA2B644D091CE8D2A1E8D492940
Expand-Archive <tmp>/uci-phishing-327.zip -DestinationPath <tmp>/uci-phishing-327
node scripts/gov-datasets/import-uci-phishing-327.mjs --arff "<tmp>/uci-phishing-327/Training Dataset.arff" --zip-sha256 514F58...92940 --out docs/datasets/uci-phishing-websites-327
```

Verified 2026-09-25: 31 attributes, 11,055 rows, 0 rejected, Result −1 (phishing) 4,898 / +1 (legitimate) 6,157.
ARFF sha256: 3BCF93B1612306537EE2737751F1BAC185B2A77886AB376644C3BF0C7F7CB3E6.

## Artifacts here

- `registry-entry.json` — PART 4.4 metadata + import-time aggregates + mapping + limitations.
- `sample-500.jsonl` — stratified 250/250 sample for inspection (full 11,055-row JSONL reproducible via the script; not stored to keep the repo lean).
- `transform.log` — run log.

## Panel mapping (research only)

- Label counts → Indicator Intelligence research-corpus card + Data Sources view.
- Top phishing-signal features → research demonstration of URL-structure signals.
- Never: case counts, maps, reports, exports as cases. The import script has no production-table access by design (writes files only).
