import { prisma } from "@/lib/prisma";
import type { CompanySegments } from "@/lib/stockAnalysisTypes";
import type { MergeIssue, PeriodKind, PeriodRow, PeriodSource, StoreChanges, Trust } from "@/lib/verified/periods";

/**
 * Permanent fundamentals store, database part.
 *
 * "FundamentalPeriod": one row per company + period (fiscal year or quarter). Append-only in
 * normal operation, so a new quarter is one small insert and nothing else is rewritten.
 * "FundamentalCompany": one row per company with its state and when to look at it next
 * (the refresh queue is just "rows whose nextCheckAt has passed").
 *
 * Plain tables created on first use because the Vercel build does not push the Prisma schema.
 */

export type CompanyStatus = "verified" | "partial" | "failed";

export type CompanyRow = {
  symbol: string;
  name: string | null;
  currency: string | null;
  profile: "bank" | "general";
  status: CompanyStatus;
  issues: MergeIssue[];
  latestQuarter: string | null;
  periods: number;
  verifiedPeriods: number;
  /** True when the stored history is deep enough to serve the page without the regular pipeline. */
  full: boolean;
  version: number;
  builtAt: string | null;
  checkedAt: string | null;
  nextCheckAt: string | null;
  segments: CompanySegments | null;
  segmentsCheckedAt: string | null;
};

type CompanyDb = {
  symbol: string;
  name: string | null;
  currency: string | null;
  profile: string | null;
  status: string;
  report: unknown;
  latestQuarter: string | null;
  periods: number | null;
  verifiedPeriods: number | null;
  full: boolean | null;
  version: number | null;
  builtAt: Date | null;
  checkedAt: Date | null;
  nextCheckAt: Date | null;
  segments?: unknown;
  segmentsCheckedAt?: Date | null;
};

let ensured: Promise<void> | null = null;

function ensureTables(): Promise<void> {
  if (!ensured) {
    const run = (sql: string) => prisma.$executeRawUnsafe(sql);
    ensured = (async () => {
      // One cheap lookup on a cold start instead of re-running the DDL every time.
      const exists = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
        `SELECT (to_regclass('"FundamentalPeriod"') IS NOT NULL AND to_regclass('"FundamentalCompany"') IS NOT NULL) AS ok`,
      );
      if (exists[0]?.ok === true) return;
      await run(
        `CREATE TABLE IF NOT EXISTS "FundamentalPeriod" (
          "symbol" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "periodEnd" TEXT NOT NULL,
          "trust" TEXT NOT NULL,
          "source" TEXT NOT NULL,
          "data" JSONB NOT NULL,
          "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY ("symbol","kind","periodEnd")
        )`,
      );
      await run(
        `CREATE TABLE IF NOT EXISTS "FundamentalCompany" (
          "symbol" TEXT PRIMARY KEY,
          "name" TEXT,
          "currency" TEXT,
          "profile" TEXT,
          "status" TEXT NOT NULL,
          "report" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "latestQuarter" TEXT,
          "periods" INTEGER NOT NULL DEFAULT 0,
          "verifiedPeriods" INTEGER NOT NULL DEFAULT 0,
          "full" BOOLEAN NOT NULL DEFAULT false,
          "version" INTEGER NOT NULL DEFAULT 0,
          "builtAt" TIMESTAMPTZ,
          "checkedAt" TIMESTAMPTZ,
          "nextCheckAt" TIMESTAMPTZ,
          "segments" JSONB,
          "segmentsCheckedAt" TIMESTAMPTZ
        )`,
      );
      await run(`CREATE INDEX IF NOT EXISTS "FundamentalCompany_nextCheckAt_idx" ON "FundamentalCompany" ("nextCheckAt")`);
      for (const table of ["FundamentalPeriod", "FundamentalCompany"]) {
        await run(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
        // Same lock-down as prisma/lock-supabase-api.sql: only Prisma (postgres role) may touch it.
        await run(`REVOKE ALL ON TABLE "${table}" FROM anon, authenticated`).catch(() => 0);
      }
    })().catch((e) => {
      ensured = null;
      throw e;
    });
  }
  return ensured;
}

const iso = (d: Date | null | undefined) => (d ? new Date(d).toISOString() : null);

function mapCompany(r: CompanyDb): CompanyRow {
  const report = (r.report ?? {}) as { issues?: MergeIssue[] };
  return {
    symbol: r.symbol,
    name: r.name,
    currency: r.currency,
    profile: r.profile === "bank" ? "bank" : "general",
    status: r.status === "verified" ? "verified" : r.status === "partial" ? "partial" : "failed",
    issues: Array.isArray(report.issues) ? report.issues : [],
    latestQuarter: r.latestQuarter,
    periods: r.periods ?? 0,
    verifiedPeriods: r.verifiedPeriods ?? 0,
    full: r.full === true,
    version: r.version ?? 0,
    builtAt: iso(r.builtAt),
    checkedAt: iso(r.checkedAt),
    nextCheckAt: iso(r.nextCheckAt),
    segments: (r.segments as CompanySegments | null | undefined) ?? null,
    segmentsCheckedAt: iso(r.segmentsCheckedAt),
  };
}

const COMPANY_COLS = `"symbol","name","currency","profile","status","report","latestQuarter","periods","verifiedPeriods","full","version","builtAt","checkedAt","nextCheckAt"`;

export async function readCompany(symbol: string): Promise<CompanyRow | null> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<CompanyDb[]>(
    `SELECT ${COMPANY_COLS},"segments","segmentsCheckedAt" FROM "FundamentalCompany" WHERE "symbol" = $1`,
    symbol,
  );
  return rows[0] ? mapCompany(rows[0]) : null;
}

/** Every company's state, without segments (small rows; used by the queue and the admin list). */
export async function listCompanies(): Promise<CompanyRow[]> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<CompanyDb[]>(`SELECT ${COMPANY_COLS} FROM "FundamentalCompany"`);
  return rows.map(mapCompany);
}

type PeriodDb = { symbol: string; kind: string; periodEnd: string; trust: string; source: string; data: unknown };

function mapPeriod(r: PeriodDb): PeriodRow {
  return {
    symbol: r.symbol,
    kind: r.kind as PeriodKind,
    end: r.periodEnd,
    trust: r.trust as Trust,
    source: r.source as PeriodSource,
    data: r.data as PeriodRow["data"],
  };
}

export async function readPeriods(symbol: string): Promise<PeriodRow[]> {
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<PeriodDb[]>(
    `SELECT "symbol","kind","periodEnd","trust","source","data" FROM "FundamentalPeriod"
     WHERE "symbol" = $1 ORDER BY "kind","periodEnd"`,
    symbol,
  );
  return rows.map(mapPeriod);
}

/** Full rows (with segments) of a handful of companies, for the segments part of the queue. */
export async function readCompanies(symbols: string[]): Promise<CompanyRow[]> {
  if (symbols.length === 0) return [];
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<CompanyDb[]>(
    `SELECT ${COMPANY_COLS},"segments","segmentsCheckedAt" FROM "FundamentalCompany"
     WHERE "symbol" IN (SELECT jsonb_array_elements_text($1::jsonb))`,
    JSON.stringify(symbols),
  );
  return rows.map(mapCompany);
}

/** Periods of several companies in one query (Compare, DCF). */
export async function readPeriodsMany(symbols: string[]): Promise<Map<string, PeriodRow[]>> {
  const out = new Map<string, PeriodRow[]>();
  if (symbols.length === 0) return out;
  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<PeriodDb[]>(
    `SELECT "symbol","kind","periodEnd","trust","source","data" FROM "FundamentalPeriod"
     WHERE "symbol" IN (SELECT jsonb_array_elements_text($1::jsonb)) ORDER BY "symbol","kind","periodEnd"`,
    JSON.stringify(symbols),
  );
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    list.push(mapPeriod(r));
    out.set(r.symbol, list);
  }
  return out;
}

/** Apply a write plan: at most one delete and one insert statement per company. */
export async function writePeriods(symbol: string, changes: StoreChanges): Promise<void> {
  await ensureTables();
  if (changes.deletes.length > 0) {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "FundamentalPeriod" WHERE "symbol" = $1
       AND ("kind" || '|' || "periodEnd") IN (SELECT jsonb_array_elements_text($2::jsonb))`,
      symbol,
      JSON.stringify(changes.deletes.map((d) => `${d.kind}|${d.end}`)),
    );
  }
  if (changes.upserts.length > 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "FundamentalPeriod" ("symbol","kind","periodEnd","trust","source","data")
       SELECT $1, x."kind", x."periodEnd", x."trust", x."source", x."data"
       FROM jsonb_to_recordset($2::jsonb) AS x("kind" text, "periodEnd" text, "trust" text, "source" text, "data" jsonb)
       ON CONFLICT ("symbol","kind","periodEnd") DO UPDATE SET
         "trust" = EXCLUDED."trust", "source" = EXCLUDED."source", "data" = EXCLUDED."data"`,
      symbol,
      JSON.stringify(changes.upserts.map((u) => ({ kind: u.kind, periodEnd: u.end, trust: u.trust, source: u.source, data: u.data }))),
    );
  }
}

export type CompanyState = {
  symbol: string;
  name: string | null;
  currency: string | null;
  profile: "bank" | "general";
  status: CompanyStatus;
  issues: MergeIssue[];
  latestQuarter: string | null;
  periods: number;
  verifiedPeriods: number;
  full: boolean;
  version: number;
  nextCheckAt: Date;
  /** False when the sources did not answer: keep the previous build time. */
  built: boolean;
};

export async function saveCompanyState(s: CompanyState): Promise<void> {
  await ensureTables();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "FundamentalCompany"
       ("symbol","name","currency","profile","status","report","latestQuarter","periods","verifiedPeriods","full","version","builtAt","checkedAt","nextCheckAt")
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11, CASE WHEN $12 THEN now() ELSE NULL END, now(), $13)
     ON CONFLICT ("symbol") DO UPDATE SET
       "name" = COALESCE(EXCLUDED."name","FundamentalCompany"."name"),
       "currency" = COALESCE(EXCLUDED."currency","FundamentalCompany"."currency"),
       "profile" = EXCLUDED."profile", "status" = EXCLUDED."status", "report" = EXCLUDED."report",
       "latestQuarter" = EXCLUDED."latestQuarter", "periods" = EXCLUDED."periods",
       "verifiedPeriods" = EXCLUDED."verifiedPeriods", "full" = EXCLUDED."full", "version" = EXCLUDED."version",
       "builtAt" = COALESCE(EXCLUDED."builtAt","FundamentalCompany"."builtAt"),
       "checkedAt" = now(), "nextCheckAt" = EXCLUDED."nextCheckAt"`,
    s.symbol,
    s.name,
    s.currency,
    s.profile,
    s.status,
    JSON.stringify({ issues: s.issues.slice(0, 25) }),
    s.latestQuarter,
    s.periods,
    s.verifiedPeriods,
    s.full,
    s.version,
    s.built,
    s.nextCheckAt,
  );
}

/** Push the next look further out without touching anything else (sources unreachable). */
export async function postponeCompany(symbol: string, nextCheckAt: Date): Promise<void> {
  await ensureTables();
  await prisma.$executeRawUnsafe(
    `UPDATE "FundamentalCompany" SET "checkedAt" = now(), "nextCheckAt" = $2 WHERE "symbol" = $1`,
    symbol,
    nextCheckAt,
  );
}

export async function saveCompanySegments(symbol: string, segments: CompanySegments | null): Promise<void> {
  await ensureTables();
  await prisma.$executeRawUnsafe(
    `UPDATE "FundamentalCompany" SET "segments" = $2::jsonb, "segmentsCheckedAt" = now() WHERE "symbol" = $1`,
    symbol,
    segments ? JSON.stringify(segments) : null,
  );
}
