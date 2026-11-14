import { fetchCompanyFacts, lookupCik } from "@/lib/edgar/client";
import { emptyInvestorMetrics } from "@/lib/edgar/normalize";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import { sanitizeBundleDilutedShares } from "@/lib/shareCountSanity";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { isVerifiedCandidate } from "@/lib/verified/candidates";
import {
  readVerified,
  saveVerified,
  saveVerifyFailure,
  touchVerifiedChecked,
  type VerifiedPayload,
  type VerifiedRow,
} from "@/lib/verified/store";
import {
  buildStatementsFromFacts,
  latestQuarterEnd,
  verifyStatements,
  type VerifiedStatements,
  type VerifyIssue,
} from "@/lib/verified/verify";
import { applyYahooFundamentalsToBundle, fetchYahooFundamentalsPayload } from "@/lib/yahooFundamentalsMerge";

const DAY_MS = 86_400_000;
/** Next quarter ends ~91 days after the stored one; filings follow 2-6 weeks later. */
const NEW_QUARTER_EARLIEST_DAYS = 91 + 10;
/** While a new report is expected, look for it at most this often per company. */
const RECHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** Companies that failed verification are retried at most this often on a page view. */
const FAILED_RETRY_MS = 7 * DAY_MS;

export type VerifiedBundleMeta = { verifiedAt: string | null; latestQuarter: string | null };

export type VerifiedOutcome =
  | { status: "verified"; symbol: string; latestQuarter: string | null; crossChecked: number; appended?: boolean }
  | { status: "failed"; symbol: string; errors: VerifyIssue[] }
  | { status: "unchanged"; symbol: string; latestQuarter: string | null };

function statementsToBundle(symbol: string, s: VerifiedStatements, dividendQuarterly?: VerifiedPayload["dividendQuarterly"]): StockAnalysisBundle {
  return {
    quote: { symbol, name: s.name, price: 0, change: 0, changesPercentage: 0 },
    income: s.income,
    cashFlow: s.cashFlow,
    balanceSheet: s.balanceSheet,
    historical: [],
    investor: emptyInvestorMetrics(s.currency),
    incomeQuarterly: s.incomeQuarterly,
    cashFlowQuarterly: s.cashFlowQuarterly,
    balanceSheetQuarterly: s.balanceSheetQuarterly,
    dividendQuarterly: dividendQuarterly ?? s.incomeQuarterly.map((q) => ({ date: q.date, dividendPerShare: null })),
  };
}

/** Fetch filings + second source, verify, and return what would be stored. */
export async function fetchAndVerify(symbol: string, sinceExclusive?: string | null) {
  const entry = await lookupCik(symbol);
  const facts = entry ? await fetchCompanyFacts(entry.cik) : null;
  const statements = facts ? buildStatementsFromFacts(symbol, facts) : null;
  if (!statements) {
    return {
      statements: null,
      payload: null,
      report: {
        ok: false,
        errors: [{ code: "no_filings", message: "No usable SEC filing data for this symbol." }],
        crossChecked: 0,
        internalChecks: 0,
      },
    };
  }
  const yahoo = await fetchYahooFundamentalsPayload(symbol);
  const report = verifyStatements(statements, yahoo, { sinceExclusive });
  if (!report.ok || !yahoo) return { statements, payload: null, report };

  // Verified figures are final. The second source only fills lines the filings do not tag
  // (e.g. dividend per share, EBITDA): "fill-gaps" never overwrites a filed value.
  const bundle = statementsToBundle(symbol, structuredClone(statements));
  applyYahooFundamentalsToBundle(bundle, yahoo, "fill-gaps");
  sanitizeBundleDilutedShares(bundle);
  trimBundleToFundamentalsWindow(bundle);
  const payload: VerifiedPayload = {
    name: statements.name,
    currency: statements.currency,
    income: bundle.income,
    cashFlow: bundle.cashFlow,
    balanceSheet: bundle.balanceSheet,
    incomeQuarterly: bundle.incomeQuarterly,
    cashFlowQuarterly: bundle.cashFlowQuarterly,
    balanceSheetQuarterly: bundle.balanceSheetQuarterly,
    dividendQuarterly: bundle.dividendQuarterly,
  };
  return { statements, payload, report };
}

/** Full (re)build for one company: replaces the stored snapshot when verification passes. */
export async function buildVerified(symbolRaw: string): Promise<VerifiedOutcome> {
  const symbol = symbolRaw.trim().toUpperCase();
  const { payload, report } = await fetchAndVerify(symbol);
  if (!payload) {
    await saveVerifyFailure(symbol, report.errors, report.crossChecked);
    return { status: "failed", symbol, errors: report.errors };
  }
  const latest = latestQuarterEnd(payload);
  await saveVerified(symbol, payload, latest, report.crossChecked);
  return { status: "verified", symbol, latestQuarter: latest, crossChecked: report.crossChecked };
}

function appendNewer<T extends { date: string }>(stored: T[], fresh: T[], keep: number): T[] {
  const last = stored.length ? stored[stored.length - 1].date.slice(0, 10) : "";
  const added = fresh.filter((r) => r.date.slice(0, 10) > last);
  return [...stored, ...added].slice(-keep);
}

/** True when a new quarterly report could be out and we have not looked recently. */
export function newQuarterCheckDue(row: Pick<VerifiedRow, "latestQuarter" | "checkedAt">, nowMs = Date.now()): boolean {
  if (!row.latestQuarter) return false;
  const latest = Date.parse(row.latestQuarter);
  if (!Number.isFinite(latest)) return false;
  if (nowMs < latest + NEW_QUARTER_EARLIEST_DAYS * DAY_MS) return false;
  const checked = Date.parse(row.checkedAt);
  return !Number.isFinite(checked) || nowMs - checked >= RECHECK_INTERVAL_MS;
}

/**
 * Look for a newly filed quarter. Stored periods stay frozen; only periods newer than the
 * stored ones are appended, and only after they pass the same verification.
 */
export async function refreshVerified(row: VerifiedRow): Promise<VerifiedOutcome> {
  const symbol = row.symbol;
  if (!row.payload) return buildVerified(symbol);
  const stored = row.payload;
  const { payload: fresh, statements, report } = await fetchAndVerify(symbol, row.latestQuarter);
  const freshLatest = statements ? latestQuarterEnd(statements) : null;
  if (!freshLatest || !row.latestQuarter || freshLatest <= row.latestQuarter) {
    await touchVerifiedChecked(symbol);
    return { status: "unchanged", symbol, latestQuarter: row.latestQuarter };
  }
  if (!fresh) {
    // New quarter is filed but not (yet) confirmed by the second source: keep serving the
    // verified history and try again later.
    await saveVerifyFailure(symbol, report.errors, report.crossChecked);
    return { status: "failed", symbol, errors: report.errors };
  }
  const merged: VerifiedPayload = {
    name: stored.name,
    currency: stored.currency,
    income: appendNewer(stored.income, fresh.income, 5),
    cashFlow: appendNewer(stored.cashFlow, fresh.cashFlow, 5),
    balanceSheet: appendNewer(stored.balanceSheet, fresh.balanceSheet, 5),
    incomeQuarterly: appendNewer(stored.incomeQuarterly, fresh.incomeQuarterly, 20),
    cashFlowQuarterly: appendNewer(stored.cashFlowQuarterly, fresh.cashFlowQuarterly, 20),
    balanceSheetQuarterly: appendNewer(stored.balanceSheetQuarterly, fresh.balanceSheetQuarterly, 20),
    dividendQuarterly: appendNewer(stored.dividendQuarterly, fresh.dividendQuarterly, 20),
  };
  const latest = latestQuarterEnd(merged);
  await saveVerified(symbol, merged, latest, row.crossChecked + report.crossChecked);
  return { status: "verified", symbol, latestQuarter: latest, crossChecked: report.crossChecked, appended: true };
}

/**
 * Bundle for a page view, or null when this symbol is not served from the verified store
 * (not a candidate, or it failed verification) — the caller then uses the regular pipeline.
 * Prices / live metrics are NOT included; the caller adds them.
 */
export async function loadVerifiedBundle(
  symbolRaw: string,
  opts?: {
    /** Runs work after the response is sent (Next `after`); falls back to fire-and-forget. */
    schedule?: (work: () => Promise<void>) => void;
    /** Visitor pressed "refresh": look for a new quarter right now instead of in the background. */
    checkNow?: boolean;
  },
): Promise<{ bundle: StockAnalysisBundle; meta: VerifiedBundleMeta } | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (!isVerifiedCandidate(symbol)) return null;

  let row = await readVerified(symbol);
  const failedRetryDue =
    row?.status === "failed" && !row.payload && Date.now() - Date.parse(row.checkedAt) >= FAILED_RETRY_MS;
  if (!row || failedRetryDue) {
    // First view of a candidate: build it now (one SEC request + the second source).
    const outcome = await buildVerified(symbol);
    if (outcome.status !== "verified") return null;
    row = await readVerified(symbol);
  }
  if (!row?.payload) return null;

  if (opts?.checkNow && newQuarterCheckDue({ latestQuarter: row.latestQuarter, checkedAt: "" })) {
    try {
      const outcome = await refreshVerified(row);
      if (outcome.status === "verified") row = (await readVerified(symbol)) ?? row;
    } catch (e) {
      console.warn(`[verified] ${symbol} refresh failed:`, e instanceof Error ? e.message : e);
    }
  } else if (newQuarterCheckDue(row)) {
    const current = row;
    const work = async () => {
      try {
        await refreshVerified(current);
      } catch (e) {
        console.warn(`[verified] ${symbol} refresh failed:`, e instanceof Error ? e.message : e);
      }
    };
    // Never make the visitor wait for the new-quarter check.
    if (opts?.schedule) opts.schedule(work);
    else void work();
  }

  const payload = row.payload;
  if (!payload) return null;
  // Clone: callers mutate the bundle (FX reconcile), the stored snapshot must stay as filed.
  const bundle = statementsToBundle(symbol, structuredClone(payload), structuredClone(payload.dividendQuarterly));
  return { bundle, meta: { verifiedAt: row.verifiedAt, latestQuarter: row.latestQuarter } };
}
