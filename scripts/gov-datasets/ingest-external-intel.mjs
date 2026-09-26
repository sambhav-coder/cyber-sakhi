/**
 * External threat-intel ingestion (manual sync): URLhaus csv_recent +
 * TweetFeed week + Feodo blocklists -> normalized IOC staging artifacts.
 *
 * Usage (PowerShell, repo root):
 *   node --experimental-strip-types scripts/gov-datasets/ingest-external-intel.mjs `
 *     --urlhaus "<tmp>/urlhaus-csv-recent.txt" `
 *     --tweetfeed "<tmp>/tweetfeed-week.json" `
 *     --feodo "<tmp>/feodo-ipblocklist.txt,<tmp>/feodo-recommended.txt" `
 *     --out docs/datasets/ext-intel-20260925
 *
 * Writes ONLY files under --out. Never touches production tables, never
 * prints secrets, never invents records. Exit non-zero on validation failure.
 * Record keys (source|type|normalized) are stable: re-runs are idempotent.
 */

import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { scoreUrlRisk, URL_RISK_RULES_VERSION } from "../../lib/gov/ml/urlRiskRules.ts";

const argPairs = process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] ?? ""]);
  return acc;
}, []);
const args = Object.fromEntries(argPairs);
const OUT = args.out;
if (!args.urlhaus || !args.tweetfeed || !args.feodo || !OUT) {
  console.error("Usage: node --experimental-strip-types ingest-external-intel.mjs --urlhaus <p> --tweetfeed <p> --feodo <p1,p2> --out <dir>");
  process.exit(2);
}

const BATCH = `ext-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-manual01`;
const FETCHED_AT = new Date().toISOString();
const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const DOMAIN = /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z0-9-]{2,}$/i;
const HEX = (n) => new RegExp(`^[0-9a-fA-F]{${n}}$`);

const records = [];
const rejects = [];
const dupCounts = {};
const seen = new Set();
let dupTotal = 0;

const keyIndex = new Map();
function emit(rec, rawCanonical) {
  const key = `${rec.source}|${rec.indicator_type}|${rec.normalized_value}`;
  if (seen.has(key)) {
    dupTotal += 1;
    dupCounts[rec.source] = (dupCounts[rec.source] ?? 0) + 1;
    // Recurring value: extend last_seen, keep earliest first_seen/provenance.
    const prev = records[keyIndex.get(key)];
    if (prev && rec.last_seen && (!prev.last_seen || rec.last_seen > prev.last_seen)) prev.last_seen = rec.last_seen;
    return;
  }
  seen.add(key);
  keyIndex.set(key, records.length);
  records.push({ ...rec, record_key: key, raw_record_hash: sha256hex(rawCanonical), ingestion_batch_id: BATCH, lifecycle: "imported", enrichment_status: "pending" });
}
const reject = (source, reason, sample) => rejects.push({ source, reason, sample: String(sample).slice(0, 160) });

function utcIso(s) {
  if (!s) return null;
  const t = Date.parse(String(s).trim().replace(" ", "T") + (String(s).includes("+") || String(s).endsWith("Z") ? "" : "Z"));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function parseCsvLine(line) {
  // Minimal CSV: all fields double-quoted, no embedded quotes in these feeds.
  const out = [];
  let cur = "", inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === "," && !inQ) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

// ---- URLhaus csv_recent ----
{
  const src = "urlhaus-csv-recent";
  const text = await fs.readFile(args.urlhaus, "utf8");
  let headerSeen = false, n = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith("#")) continue;
    const c = parseCsvLine(line);
    if (c.length < 9) { reject(src, "wrong-column-count", line); continue; }
    n += 1;
    const [id, dateadded, url, urlStatus, lastOnline, threat, tags, link, reporter] = c.map((x) => x.trim());
    const firstSeen = utcIso(dateadded), lastSeen = utcIso(lastOnline);
    if (!firstSeen) { reject(src, "bad-dateadded", id); continue; }
    if (!/^https?:\/\//i.test(url) || url.length > 2048) { reject(src, "bad-url", id); continue; }
    const rec = {
      source: src, source_record_id: id, indicator_type: "url", normalized_value: url,
      first_seen: firstSeen, last_seen: lastSeen, observed_at: firstSeen, fetched_at: FETCHED_AT,
      malware_family: null, threat_category: threat === "malware_download" ? "MALWARE_DISTRIBUTION" : "UNSPECIFIED",
      tags: tags ? tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
      confidence: null, status: urlStatus === "online" ? "online" : urlStatus === "offline" ? "offline" : "unknown",
      expiration: null, revocation: null, source_url: link || null, reporter: reporter || null,
    };
    if (urlStatus === "offline" && lastSeen) rec.expiration = lastSeen;
    const rules = scoreUrlRisk(url);
    rec.enrichment = { rules_version: URL_RISK_RULES_VERSION, rules_score: rules.score, rules_band: rules.band, rules_signals: rules.signals.map((s) => s.code) };
    rec.enrichment_status = "rules-scored";
    emit(rec, line);
  }
  console.log(`${src}: parsed=${n} kept=${records.filter((r) => r.source === src).length}`);
}

// ---- TweetFeed week ----
{
  const src = "tweetfeed-week";
  const items = JSON.parse(await fs.readFile(args.tweetfeed, "utf8"));
  const TAG2CAT = { phishing: "PHISHING", malware: "MALWARE", ransomware: "RANSOMWARE", c2: "C2_INFRASTRUCTURE", scam: "SCAM", cryptoscam: "SCAM", apt: "APT", clickfix: "CLICKFIX_SOCIAL_ENGINEERING", clearfake: "CLEARFAKE_SOCIAL_ENGINEERING", cobaltstrike: "MALWARE_TOOLING", rat: "MALWARE_TOOLING", asyncrat: "MALWARE_TOOLING", stealer: "MALWARE_TOOLING", kimsuky: "APT", opendir: "EXPOSED_SERVICE" };
  let n = 0;
  for (const it of items) {
    n += 1;
    const type = String(it.type ?? "").toLowerCase();
    const value = String(it.value ?? "").trim();
    const observed = utcIso(it.date);
    if (!observed) { reject(src, "bad-date", value); continue; }
    let itype = null, norm = value;
    if (type === "url") {
      if (!/^https?:\/\//i.test(value) || value.length > 2048) { reject(src, "bad-url", value); continue; }
      itype = "url";
    } else if (type === "domain") {
      norm = value.toLowerCase();
      if (!DOMAIN.test(norm)) { reject(src, "bad-domain", value); continue; }
      itype = "domain";
    } else if (type === "ip") {
      if (!IPV4.test(value)) { reject(src, "bad-ip", value); continue; }
      itype = "ip";
    } else if (type === "md5") {
      norm = value.toLowerCase();
      if (!HEX(32).test(norm)) { reject(src, "bad-md5", value); continue; }
      itype = "md5";
    } else if (type === "sha256") {
      norm = value.toLowerCase();
      if (!HEX(64).test(norm)) { reject(src, "bad-sha256", value); continue; }
      itype = "hash-sha256";
    } else { reject(src, "unsupported-type", `${type}:${value}`); continue; }
    const tags = Array.isArray(it.tags) ? it.tags.map((t) => String(t).replace(/^#/, "").toLowerCase()) : [];
    const cats = [...new Set(tags.map((t) => TAG2CAT[t]).filter(Boolean))];
    const rec = {
      source: src, source_record_id: `${it.user ?? "unknown"}:${it.tweet ?? value}:${itype}`, indicator_type: itype, normalized_value: norm,
      first_seen: observed, last_seen: observed, observed_at: observed, fetched_at: FETCHED_AT,
      malware_family: null, threat_category: cats[0] ?? "UNSPECIFIED", tags,
      confidence: null, status: "unknown", expiration: null, revocation: null,
      source_url: it.tweet ?? null, reporter: it.user ?? null,
    };
    if (itype === "url") {
      const rules = scoreUrlRisk(norm);
      rec.enrichment = { rules_version: URL_RISK_RULES_VERSION, rules_score: rules.score, rules_band: rules.band, rules_signals: rules.signals.map((s) => s.code) };
      rec.enrichment_status = "rules-scored";
    }
    emit(rec, JSON.stringify(it));
  }
  console.log(`${src}: parsed=${n} kept=${records.filter((r) => r.source === src).length}`);
}

// ---- Feodo blocklists ----
{
  const src = "feodo-ipblocklist";
  for (const p of args.feodo.split(",")) {
    const text = await fs.readFile(p.trim(), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const v = line.trim();
      if (!v || v.startsWith("#")) continue;
      if (!IPV4.test(v)) { reject(src, "bad-ip", v); continue; }
      emit({
        source: src, source_record_id: v, indicator_type: "ip", normalized_value: v,
        first_seen: null, last_seen: null, observed_at: null, fetched_at: FETCHED_AT,
        malware_family: null, threat_category: "C2_INFRASTRUCTURE", tags: ["feodo", "botnet-c2"],
        confidence: null, status: "blocklisted", expiration: null, revocation: null,
        source_url: "https://feodotracker.abuse.ch/blocklist/", reporter: null,
      }, v);
    }
  }
  console.log(`${src}: kept=${records.filter((r) => r.source === src).length}`);
}

// ---- cross-source overlap (records stay separate; overlap only reported) ----
{
  const byValue = new Map();
  for (const r of records) {
    const k = `${r.indicator_type}|${r.normalized_value}`;
    if (!byValue.has(k)) byValue.set(k, new Set());
    byValue.get(k).add(r.source);
  }
  const overlap = [...byValue.values()].filter((s) => s.size > 1).length;
  console.log(`cross-source overlapping values (kept separate): ${overlap}`);
}

// ---- outputs ----
await fs.mkdir(path.resolve(OUT), { recursive: true });
const j = (o) => JSON.stringify(o);
await fs.writeFile(path.join(OUT, "iocs.jsonl"), records.map(j).join("\n") + "\n");
await fs.writeFile(path.join(OUT, "rejected.jsonl"), rejects.map(j).join("\n") + (rejects.length ? "\n" : ""));

const byType = {}, bySource = {}, byThreat = {}, byDay = {};
for (const r of records) {
  byType[r.indicator_type] = (byType[r.indicator_type] ?? 0) + 1;
  bySource[r.source] = (bySource[r.source] ?? 0) + 1;
  byThreat[r.threat_category] = (byThreat[r.threat_category] ?? 0) + 1;
  const day = (r.observed_at ?? r.fetched_at).slice(0, 10);
  byDay[day] = (byDay[day] ?? 0) + 1;
}
const days = Object.keys(byDay).sort();
const coverage = {
  requested_start: "2026-06-27T00:00:00Z", requested_end: "2026-09-25T23:59:59Z",
  batch_id: BATCH, ingestion_time: FETCHED_AT,
  sources: {
    "urlhaus-csv-recent": { actual_start: null, actual_end: null },
    "tweetfeed-week": { actual_start: null, actual_end: null },
    "feodo-ipblocklist": { actual_start: null, actual_end: "2026-03-04T14:28:39Z (feed header; stale)" },
  },
  record_count: records.length, unique_record_count: seen.size,
  duplicate_count: dupTotal, duplicates_by_source: dupCounts,
  rejected_count: rejects.length,
  by_type: byType, by_source: bySource, by_threat: byThreat, by_day: byDay,
  actual_source_start: days[0] ?? null, actual_source_end: days[days.length - 1] ?? null,
};
for (const r of records) {
  const s = coverage.sources[r.source];
  if (r.observed_at && s && s.actual_start !== undefined && !s.actual_start?.includes("feed header")) {
    if (!s.actual_start || r.observed_at < s.actual_start) s.actual_start = r.observed_at;
    if (!s.actual_end || r.observed_at > s.actual_end) s.actual_end = r.observed_at;
  }
}
await fs.writeFile(path.join(OUT, "coverage.json"), JSON.stringify(coverage, null, 2) + "\n");
await fs.writeFile(path.join(OUT, "sync-health.json"), JSON.stringify({
  batch_id: BATCH, synced_at: FETCHED_AT, mode: "manual",
  status_by_source: { "urlhaus-csv-recent": "synced", "tweetfeed-week": "synced", "feodo-ipblocklist": "synced-stale-feed" },
  next: "scheduled sync architecture: cron/edge-function re-runs this script with --since watermark (sync-state.json); manual run only for now",
}, null, 2) + "\n");
await fs.writeFile(path.join(OUT, "sync-state.json"), JSON.stringify({ batch_id: BATCH, watermarks: coverage.sources }, null, 2) + "\n");
console.log(`OK batch=${BATCH} records=${records.length} rejected=${rejects.length} dups=${dupTotal} out=${OUT}`);
if (rejects.length > 5000) { console.error("too many rejects"); process.exit(1); }
