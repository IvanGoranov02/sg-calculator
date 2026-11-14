import { prisma } from "@/lib/prisma";
import type { DividendQuarterlyPoint } from "@/lib/stockAnalysisTypes";
import type { VerifiedStatements, VerifyIssue } from "@/lib/verified/verify";

/**
 * Static store of verified fundamentals. One row per company; written only by the verified
 * build/refresh code, never by the regular (Yahoo/Gemini) pipeline. Plain table created on
 * first use because the Vercel build does not push the Prisma schema.
 */

export type VerifiedPayload = VerifiedStatements & {
  dividendQuarterly: DividendQuarterlyPoint[];
};

export type VerifiedRow = {
  symbol: string;
  status: "verified" | "failed";
  payload: VerifiedPayload | null;
  errors: VerifyIssue[];
  crossChecked: number;
  latestQuarter: string | null;
  verifiedAt: string | null;
  checkedAt: string;
};

type DbRow = {
  symbol: string;
  status: string;
  payload: unknown;
  report: unknown;
  latestQuarter: string | null;
  verifiedAt: Date | null;
  checkedAt: Date;
};

let ensured: Promise<void> | null = null;

function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = prisma
      .$executeRawUnsafe(
        `CREATE TABLE IF NOT EXISTS "VerifiedFundamentals" (
          "symbol" TEXT PRIMARY KEY,
          "status" TEXT NOT NULL,
          "payload" JSONB,
          "report" JSONB NOT NULL DEFAULT '{}'::jsonb,
          "latestQuarter" TEXT,
          "verifiedAt" TIMESTAMPTZ,
          "checkedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
      )
      .then(() => prisma.$executeRawUnsafe(`ALTER TABLE "VerifiedFundamentals" ENABLE ROW LEVEL SECURITY`))
      .then(() =>
        // Same lock-down as prisma/lock-supabase-api.sql: only Prisma (postgres role) may touch it.
        prisma.$executeRawUnsafe(`REVOKE ALL ON TABLE "VerifiedFundamentals" FROM anon, authenticated`).catch(() => 0),
      )
      .then(() => undefined)
      .catch((e) => {
        ensured = null;
        throw e;
      });
  }
  return ensured;
}

function mapRow(r: DbRow, withPayload: boolean): VerifiedRow {
  const report = (r.report ?? {}) as { errors?: VerifyIssue[]; crossChecked?: number };
  return {
    symbol: r.symbol,
    status: r.status === "verified" ? "verified" : "failed",
    payload: withPayload ? ((r.payload as VerifiedPayload | null) ?? null) : null,
    errors: Array.isArray(report.errors) ? report.errors : [],
    crossChecked: typeof report.crossChecked === "number" ? report.crossChecked : 0,
    latestQuarter: r.latestQuarter,
    verifiedAt: r.verifiedAt ? new Date(r.verifiedAt).toISOString() : null,
    checkedAt: new Date(r.checkedAt).toISOString(),
  };
}

export async function readVerified(symbol: string): Promise<VerifiedRow | null> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT "symbol","status","payload","report","latestQuarter","verifiedAt","checkedAt"
     FROM "VerifiedFundamentals" WHERE "symbol" = $1`,
    symbol,
  );
  return rows[0] ? mapRow(rows[0], true) : null;
}

/** Status of every row, without the (large) statements payload. */
export async function listVerified(): Promise<VerifiedRow[]> {
  await ensureTable();
  const rows = await prisma.$queryRawUnsafe<DbRow[]>(
    `SELECT "symbol","status",NULL::jsonb AS "payload","report","latestQuarter","verifiedAt","checkedAt"
     FROM "VerifiedFundamentals"`,
  );
  return rows.map((r) => mapRow(r, false));
}

/** Store a verified snapshot (replaces whatever was there). */
export async function saveVerified(
  symbol: string,
  payload: VerifiedPayload,
  latestQuarter: string | null,
  crossChecked: number,
): Promise<void> {
  await ensureTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "VerifiedFundamentals" ("symbol","status","payload","report","latestQuarter","verifiedAt","checkedAt")
     VALUES ($1,'verified',$2::jsonb,$3::jsonb,$4,now(),now())
     ON CONFLICT ("symbol") DO UPDATE SET
       "status"='verified', "payload"=EXCLUDED."payload", "report"=EXCLUDED."report",
       "latestQuarter"=EXCLUDED."latestQuarter", "verifiedAt"=now(), "checkedAt"=now()`,
    symbol,
    JSON.stringify(payload),
    JSON.stringify({ errors: [], crossChecked }),
    latestQuarter,
  );
}

/**
 * Record a failed attempt. An existing verified snapshot is kept untouched (a failed check
 * of a NEW quarter must never destroy the good history); only the report/checkedAt change.
 */
export async function saveVerifyFailure(symbol: string, errors: VerifyIssue[], crossChecked: number): Promise<void> {
  await ensureTable();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "VerifiedFundamentals" ("symbol","status","payload","report","checkedAt")
     VALUES ($1,'failed',NULL,$2::jsonb,now())
     ON CONFLICT ("symbol") DO UPDATE SET "report"=EXCLUDED."report", "checkedAt"=now()`,
    symbol,
    JSON.stringify({ errors: errors.slice(0, 25), crossChecked }),
  );
}

export async function touchVerifiedChecked(symbol: string): Promise<void> {
  await ensureTable();
  await prisma.$executeRawUnsafe(`UPDATE "VerifiedFundamentals" SET "checkedAt"=now() WHERE "symbol"=$1`, symbol);
}
