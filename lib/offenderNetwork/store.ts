import { promises as fs } from "fs";
import path from "path";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import type { IndicatorType, ReportCategory } from "./constants";

/* ------------------------------------------------------------------ *
 * Sakhi Network storage — SERVER ONLY.
 *
 * A row says "account X (fingerprinted) reported identifier Y
 * (fingerprinted)". There is no column that could hold a phone number,
 * a message, a name, or an email.
 *
 * Two backends behind one interface:
 *   supabase — production; table created by
 *              supabase/migrations/create_offender_network.sql
 *   file     — local development only, so the feature works on a machine
 *              without Supabase keys. Refused in production, because a
 *              serverless filesystem is neither persistent nor shared.
 * ------------------------------------------------------------------ */

export interface IndicatorReport {
  indicatorHash: string;
  indicatorType: IndicatorType;
  reporterHash: string;
  category: ReportCategory;
  region: string | null;
  createdAt: string;
}

export interface IndicatorStats {
  indicatorHash: string;
  totalReporters: number;
  otherReporters: number;
  requesterHasReported: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
  regions: string[];
  categories: ReportCategory[];
}

export interface OffenderStore {
  readonly backend: "file" | "supabase";
  /** One reporter counts once per identifier; repeats are ignored, not added. */
  addReports(reports: IndicatorReport[]): Promise<{ inserted: number; duplicates: number }>;
  getStats(hashes: string[], requesterHash: string | null): Promise<Map<string, IndicatorStats>>;
  countReportsSince(reporterHash: string, sinceIso: string): Promise<number>;
}

/* Shared by both backends so they cannot disagree on the numbers. */
export function aggregateStats(
  rows: IndicatorReport[],
  hashes: string[],
  requesterHash: string | null
): Map<string, IndicatorStats> {
  const out = new Map<string, IndicatorStats>();

  for (const hash of hashes) {
    const mine = rows.filter((r) => r.indicatorHash === hash);
    const reporters = new Set(mine.map((r) => r.reporterHash));
    const requesterHasReported = requesterHash ? reporters.has(requesterHash) : false;
    const times = mine.map((r) => r.createdAt).sort();

    out.set(hash, {
      indicatorHash: hash,
      totalReporters: reporters.size,
      otherReporters: reporters.size - (requesterHasReported ? 1 : 0),
      requesterHasReported,
      firstSeen: times[0] ?? null,
      lastSeen: times[times.length - 1] ?? null,
      regions: Array.from(
        new Set(mine.map((r) => r.region).filter((x): x is string => Boolean(x)))
      ).sort(),
      categories: Array.from(new Set(mine.map((r) => r.category))),
    });
  }

  return out;
}

/* ----------------------------- file backend --------------------------- */

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "offender-network.json");

interface FileShape {
  version: 1;
  reports: IndicatorReport[];
}

class FileStore implements OffenderStore {
  readonly backend = "file" as const;
  // Serialises writes so two concurrent reports cannot clobber each other.
  private writeChain: Promise<unknown> = Promise.resolve();

  private async readAll(): Promise<IndicatorReport[]> {
    try {
      const raw = await fs.readFile(DATA_FILE, "utf8");
      const parsed = JSON.parse(raw) as Partial<FileShape>;
      return Array.isArray(parsed.reports) ? parsed.reports : [];
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }

  private async writeAll(reports: IndicatorReport[]): Promise<void> {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.tmp`;
    const body: FileShape = { version: 1, reports };
    await fs.writeFile(tmp, JSON.stringify(body), "utf8");
    // Rename is atomic, so a crash mid-write never leaves a torn file.
    await fs.rename(tmp, DATA_FILE);
  }

  addReports(reports: IndicatorReport[]) {
    const run = async () => {
      const all = await this.readAll();
      const seen = new Set(all.map((r) => `${r.indicatorHash}:${r.reporterHash}`));
      let inserted = 0;
      let duplicates = 0;

      for (const r of reports) {
        const key = `${r.indicatorHash}:${r.reporterHash}`;
        if (seen.has(key)) {
          duplicates++;
          continue;
        }
        seen.add(key);
        all.push(r);
        inserted++;
      }

      if (inserted > 0) await this.writeAll(all);
      return { inserted, duplicates };
    };

    const next = this.writeChain.then(run, run);
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  async getStats(hashes: string[], requesterHash: string | null) {
    const wanted = new Set(hashes);
    const rows = (await this.readAll()).filter((r) => wanted.has(r.indicatorHash));
    return aggregateStats(rows, hashes, requesterHash);
  }

  async countReportsSince(reporterHash: string, sinceIso: string) {
    return (await this.readAll()).filter(
      (r) => r.reporterHash === reporterHash && r.createdAt >= sinceIso
    ).length;
  }
}

/* --------------------------- supabase backend ------------------------- */

const TABLE = "offender_indicator_reports";

interface ReportRow {
  indicator_hash: string;
  indicator_type: IndicatorType;
  reporter_hash: string;
  category: ReportCategory;
  region: string | null;
  created_at: string;
}

class SupabaseStore implements OffenderStore {
  readonly backend = "supabase" as const;

  async addReports(reports: IndicatorReport[]) {
    if (reports.length === 0) return { inserted: 0, duplicates: 0 };

    const { data, error } = await getSupabaseServer()
      .from(TABLE)
      .upsert(
        reports.map((r) => ({
          indicator_hash: r.indicatorHash,
          indicator_type: r.indicatorType,
          reporter_hash: r.reporterHash,
          category: r.category,
          region: r.region,
          created_at: r.createdAt,
        })),
        { onConflict: "indicator_hash,reporter_hash", ignoreDuplicates: true }
      )
      .select("indicator_hash");

    throwIfError(error, "Failed to record Sakhi Network reports.");
    const inserted = (data || []).length;
    return { inserted, duplicates: reports.length - inserted };
  }

  async getStats(hashes: string[], requesterHash: string | null) {
    if (hashes.length === 0) return new Map<string, IndicatorStats>();

    const { data, error } = await getSupabaseServer()
      .from(TABLE)
      .select("indicator_hash, indicator_type, reporter_hash, category, region, created_at")
      .in("indicator_hash", hashes);

    throwIfError(error, "Failed to read Sakhi Network reports.");
    const rows: IndicatorReport[] = ((data || []) as ReportRow[]).map((r) => ({
      indicatorHash: r.indicator_hash,
      indicatorType: r.indicator_type,
      reporterHash: r.reporter_hash,
      category: r.category,
      region: r.region,
      createdAt: r.created_at,
    }));
    return aggregateStats(rows, hashes, requesterHash);
  }

  async countReportsSince(reporterHash: string, sinceIso: string) {
    const { count, error } = await getSupabaseServer()
      .from(TABLE)
      .select("indicator_hash", { count: "exact", head: true })
      .eq("reporter_hash", reporterHash)
      .gte("created_at", sinceIso);

    throwIfError(error, "Failed to check Sakhi Network rate limit.");
    return count ?? 0;
  }
}

/* ------------------------------- selection ---------------------------- */

let cached: OffenderStore | null = null;

export function getOffenderStore(): OffenderStore {
  if (cached) return cached;

  const hasSupabase =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY);
  const forced = process.env.OFFENDER_NETWORK_STORE;
  const useSupabase = forced ? forced === "supabase" : hasSupabase;

  if (!useSupabase && process.env.NODE_ENV === "production") {
    throw new Error(
      "Sakhi Network needs Supabase in production: the local file store is neither persistent nor shared on a serverless host."
    );
  }

  cached = useSupabase ? new SupabaseStore() : new FileStore();
  return cached;
}
