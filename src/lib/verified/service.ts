import { fetchCompanyFacts, lookupCik } from "@/lib/edgar/client";
import { bankSeriesFromCompanyFacts, emptyInvestorMetrics } from "@/lib/edgar/normalize";
import { trimBundleToFundamentalsWindow } from "@/lib/fundamentalsHistoryLimits";
import { sanitizeBundleDilutedShares } from "@/lib/shareCountSanity";
import type { CompanySegments, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import {
  listCompanies,
  postponeCompany,
  readCompanies,
  readCompany,
  readPeriods,
  saveCompanyState,
  writePeriods,
  type CompanyRow,
  type CompanyStatus,
} from "@/lib/verified/periodStore";
import {
  applyBankTemplate,
  applyStoreChanges,
  dropBankLines,
  looksLikeBank,
  mergePeriods,
  nextCheckTime,
  planStoreChanges,
  rowsToStatements,
  secPeriods,
  storeCoverage,
  yahooPeriods,
  type MergeIssue,
  type PeriodRow,
  type StoreStatements,
} from "@/lib/verified/periods";
import { SEGMENT_SYMBOLS, refreshSegmentsIfDue, segmentsDue } from "@/lib/verified/segments";
import { UNIVERSE, isInUniverse } from "@/lib/verified/universe";
import { buildStatementsFromFacts } from "@/lib/verified/verify";
import { fetchYahooFundamentalsPayload } from "@/lib/yahooFundamentalsMerge";

/**
 * Bump when the way periods are built changes (normalizer fix, new stored lines). Companies
 * built with an older version are rebuilt once, replacing their stored periods.
 */
export const STORE_VERSION = 1;

const DAY_MS = 86_400_000;
/** Company-level "verified": deep filing history, no disagreement, real overlap with source two. */
const VERIFIED_MIN_ANNUAL = 4;
const VERIFIED_MIN_QUARTERS = 16;

export type StoreMeta = {
  status: CompanyStatus;
  /** "store" = the page is served from the store alone; "overlay" = stored periods laid over the regular pipeline. */
  mode: "store" | "overlay";
  latestQuarter: string | null;
  periods: number;
  verifiedPeriods: number;
  builtAt: string | null;
};

export type BuildOutcome = {
  symbol: string;
  status: CompanyStatus;
  periods: number;
  verifiedPeriods: number;
  added: number;
  latestQuarter: string | null;
  issues: MergeIssue[];
};

export type FreshCompany = {
  name: string | null;
  currency: string | null;
  profile: "bank" | "general";
  rows: PeriodRow[];
  issues: MergeIssue[];
  hasSec: boolean;
  /** Filing periods alone (before the merge), for the company-level verdict. */
  secAnnual: number;
  secQuarters: number;
};

/** Ask both sources and merge them period by period. No database access. */
export async function fetchFreshCompany(symbolRaw: string): Promise<FreshCompany> {
  const symbol = symbolRaw.trim().toUpperCase();
  const [facts, yahoo] = await Promise.all([
    lookupCik(symbol).then((entry) => (entry ? fetchCompanyFacts(entry.cik) : null)),
    fetchYahooFundamentalsPayload(symbol),
  ]);
  const statements = facts ? buildStatementsFromFacts(symbol, facts) : null;
  const sec = statements ? secPeriods(statements, facts ? bankSeriesFromCompanyFacts(facts) : null) : [];
  const yh = yahoo ? yahooPeriods(yahoo) : [];
  const bank = looksLikeBank(sec.length ? sec : yh);
  if (bank) {
    applyBankTemplate(sec);
    applyBankTemplate(yh);
  } else {
    dropBankLines(sec);
    dropBankLines(yh);
  }
  const merged = mergePeriods(symbol, sec, yh, { bank });
  return {
    name: statements?.name ?? null,
    currency: statements?.currency ?? null,
    profile: bank ? "bank" : "general",
    rows: merged.rows,
    issues: merged.issues,
    hasSec: sec.length > 0,
    secAnnual: sec.filter((p) => p.kind === "A").length,
    secQuarters: sec.filter((p) => p.kind === "Q").length,
  };
}

/** Company-level verdict from the stored rows and what the last build reported. */
export function companyStatus(rows: PeriodRow[], fresh: Pick<FreshCompany, "issues" | "secAnnual" | "secQuarters">): CompanyStatus {
  if (rows.length === 0) return "failed";
  const cov = storeCoverage(rows);
  const verifiedAnnual = rows.filter((r) => r.kind === "A" && r.trust === "verified").length;
  const verifiedQuarters = rows.filter((r) => r.kind === "Q" && r.trust === "verified").length;
  // "Verified" is a claim about everything the page shows: no disputed period, and no
  // recent period that rests on one source alone.
  const shown = [...rows.filter((r) => r.kind === "A").slice(-5), ...rows.filter((r) => r.kind === "Q").slice(-20)];
  const clean = fresh.issues.length === 0 && !shown.some((r) => r.trust === "disputed" || r.trust === "single");
  const deep = fresh.secAnnual >= VERIFIED_MIN_ANNUAL && fresh.secQuarters >= VERIFIED_MIN_QUARTERS && cov.full;
  return clean && deep && verifiedAnnual >= 2 && verifiedQuarters >= 2 ? "verified" : "partial";
}

/**
 * Fetch, merge and store one company. Stored periods are permanent: only new periods are
 * added and weaker ones upgraded. `force` (admin rebuild, version bump) replaces them.
 */
export async function buildCompany(symbolRaw: string, opts?: { force?: boolean }): Promise<BuildOutcome> {
  const symbol = symbolRaw.trim().toUpperCase();
  const [fresh, existing, prev] = await Promise.all([fetchFreshCompany(symbol), readPeriods(symbol), readCompany(symbol)]);
  const now = Date.now();
  if (fresh.rows.length === 0 && existing.length > 0) {
    // Sources did not answer; what is stored stays as it is.
    await postponeCompany(symbol, new Date(now + DAY_MS));
    const cov = storeCoverage(existing);
    return {
      symbol,
      status: prev?.status ?? "partial",
      periods: cov.total,
      verifiedPeriods: cov.verified,
      added: 0,
      latestQuarter: cov.latestQuarter,
      issues: [{ code: "sources_unavailable", message: "Sources did not answer; stored data kept." }],
    };
  }
  const force = opts?.force === true || (prev != null && prev.version !== STORE_VERSION);
  const changes = planStoreChanges(existing, fresh.rows, force);
  if (changes.upserts.length || changes.deletes.length) await writePeriods(symbol, changes);
  const rows = applyStoreChanges(existing, changes);
  const cov = storeCoverage(rows);
  const status = companyStatus(rows, fresh);
  const latest = rows.filter((r) => r.kind === "Q").pop();
  // The newest quarter came from one source although the company files with the SEC: the
  // filing usually follows within days and upgrades the row.
  const awaitingConfirmation =
    fresh.hasSec && latest?.trust === "single" && now - Date.parse(latest.end) < 100 * DAY_MS;
  await saveCompanyState({
    symbol,
    name: fresh.name ?? prev?.name ?? null,
    currency: fresh.currency ?? prev?.currency ?? null,
    profile: fresh.profile,
    status,
    issues: fresh.issues.length ? fresh.issues : rows.length ? [] : [{ code: "no_data", message: "Neither source has statements for this symbol." }],
    latestQuarter: cov.latestQuarter,
    periods: cov.total,
    verifiedPeriods: cov.verified,
    full: cov.full,
    version: STORE_VERSION,
    nextCheckAt: new Date(nextCheckTime(cov, { now, hasRows: rows.length > 0, awaitingConfirmation })),
    built: true,
  });
  return {
    symbol,
    status,
    periods: cov.total,
    verifiedPeriods: cov.verified,
    added: changes.upserts.length,
    latestQuarter: cov.latestQuarter,
    issues: fresh.issues,
  };
}

function statementsToBundle(symbol: string, s: StoreStatements): StockAnalysisBundle {
  const bundle: StockAnalysisBundle = {
    quote: { symbol, name: s.name, price: 0, change: 0, changesPercentage: 0 },
    income: s.income,
    cashFlow: s.cashFlow,
    balanceSheet: s.balanceSheet,
    historical: [],
    investor: emptyInvestorMetrics(s.currency),
    incomeQuarterly: s.incomeQuarterly,
    cashFlowQuarterly: s.cashFlowQuarterly,
    balanceSheetQuarterly: s.balanceSheetQuarterly,
    dividendQuarterly: s.dividendQuarterly,
    bank: s.bank,
  };
  sanitizeBundleDilutedShares(bundle);
  trimBundleToFundamentalsWindow(bundle);
  return bundle;
}

function checkDue(company: CompanyRow, now = Date.now()): boolean {
  if (company.version !== STORE_VERSION) return true;
  return company.nextCheckAt != null && Date.parse(company.nextCheckAt) <= now;
}

export type StoreLoad = {
  meta: StoreMeta;
  /** Set when the page can be served from the store alone. */
  bundle: StockAnalysisBundle | null;
  /** Stored periods, to lay over the regular pipeline's bundle when `bundle` is null. */
  statements: StoreStatements;
  /** Revenue by business line, when stored for this company. */
  segments: CompanySegments | null;
};

/**
 * What the store has for a page view, or null when it has nothing (the caller then uses the
 * regular pipeline alone). Never fetches prices. Companies of the universe are built on
 * their first view; any other company is stored by the caller after a successful load.
 */
export async function loadFromStore(
  symbolRaw: string,
  opts?: {
    /** Runs work after the response is sent (Next `after`); falls back to fire-and-forget. */
    schedule?: (work: () => Promise<void>) => void;
    /** Visitor pressed "refresh": look for a new report now instead of in the background. */
    checkNow?: boolean;
  },
): Promise<StoreLoad | null> {
  const symbol = symbolRaw.trim().toUpperCase();
  const background = (work: () => Promise<unknown>) => {
    const safe = async () => {
      try {
        await work();
      } catch (e) {
        console.warn(`[store] ${symbol} background work failed:`, e instanceof Error ? e.message : e);
      }
    };
    if (opts?.schedule) opts.schedule(safe);
    else void safe();
  };

  let [company, rows] = await Promise.all([readCompany(symbol), readPeriods(symbol)]);
  if (!company) {
    // Not in the universe: the caller stores it after the regular pipeline has shown that
    // the symbol is real (see ensureStored), so typos never reach the database.
    if (!isInUniverse(symbol)) return null;
    await buildCompany(symbol);
    [company, rows] = await Promise.all([readCompany(symbol), readPeriods(symbol)]);
  } else if (checkDue(company)) {
    if (opts?.checkNow) {
      await buildCompany(symbol).catch(() => null);
      [company, rows] = await Promise.all([readCompany(symbol), readPeriods(symbol)]);
    } else {
      background(() => buildCompany(symbol));
    }
  }
  if (!company || rows.length === 0) return null;
  if (company.profile !== "bank") {
    const c = company;
    background(() => refreshSegmentsIfDue(c));
  }

  const cov = storeCoverage(rows);
  const statements = rowsToStatements(symbol, company.name ?? symbol, company.currency ?? "USD", rows);
  const meta: StoreMeta = {
    status: company.status,
    mode: cov.full ? "store" : "overlay",
    latestQuarter: cov.latestQuarter,
    periods: cov.total,
    verifiedPeriods: cov.verified,
    builtAt: company.builtAt,
  };
  const bundle = cov.full ? statementsToBundle(symbol, structuredClone(statements)) : null;
  // Only what the page draws; the bookkeeping of the reader stays in the database.
  const stored = company.segments;
  const segments: CompanySegments | null =
    stored && stored.names.length > 0 ? { names: stored.names, annual: stored.annual, quarterly: stored.quarterly } : null;
  if (bundle && segments) bundle.segments = segments;
  return { meta, bundle, statements, segments };
}

/** Store a company that is not stored yet (any company joins the store once it has been viewed). */
export async function ensureStored(symbolRaw: string): Promise<void> {
  const symbol = symbolRaw.trim().toUpperCase();
  if (await readCompany(symbol)) return;
  await buildCompany(symbol);
}

/* ------------------------------------------------------------------ */
/* Refresh queue                                                        */
/* ------------------------------------------------------------------ */

export type QueueRun = {
  processed: { symbol: string; result: string }[];
  /** Companies still waiting right now (not yet built, or due for a check). */
  remaining: number;
  ms: number;
};

/** Symbols to work on now: never-built universe companies first (largest first), then due checks. */
export function pickQueue(companies: Pick<CompanyRow, "symbol" | "version" | "nextCheckAt">[], now = Date.now()): string[] {
  const known = new Map(companies.map((c) => [c.symbol, c]));
  const missing = UNIVERSE.filter((u) => !known.has(u.s)).map((u) => u.s);
  const due = companies
    .filter((c) => c.version !== STORE_VERSION || (c.nextCheckAt != null && Date.parse(c.nextCheckAt) <= now))
    .sort((a, b) => Date.parse(a.nextCheckAt ?? "1970-01-01") - Date.parse(b.nextCheckAt ?? "1970-01-01"))
    .map((c) => c.symbol);
  return [...missing, ...due];
}

/**
 * Work through the queue for at most `budgetMs`, two companies at a time. Safe to call as
 * often as wanted: each company is only touched when it is due.
 */
export async function runQueue(budgetMs: number): Promise<QueueRun> {
  const started = Date.now();
  const companies = await listCompanies();
  const known = new Set(companies.map((c) => c.symbol));
  const queue = pickQueue(companies);
  const processed: QueueRun["processed"] = [];
  let next = 0;
  const worker = async () => {
    while (next < queue.length && Date.now() - started < budgetMs) {
      const symbol = queue[next++];
      try {
        const out = await buildCompany(symbol);
        processed.push({ symbol, result: out.added > 0 ? `${out.status} +${out.added}` : out.status });
      } catch (e) {
        processed.push({ symbol, result: `error: ${e instanceof Error ? e.message.slice(0, 120) : "unknown"}` });
        // Do not let one broken company block the queue: look at it again tomorrow.
        const tomorrow = new Date(Date.now() + DAY_MS);
        await (known.has(symbol)
          ? postponeCompany(symbol, tomorrow)
          : saveCompanyState({
              symbol,
              name: null,
              currency: null,
              profile: "general",
              status: "failed",
              issues: [{ code: "build_error", message: "Build failed; it will be retried." }],
              latestQuarter: null,
              periods: 0,
              verifiedPeriods: 0,
              full: false,
              version: STORE_VERSION,
              nextCheckAt: tomorrow,
              built: false,
            })
        ).catch(() => undefined);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  // Left-over time: read segment notes for the largest companies (several MB per filing).
  if (Date.now() - started < budgetMs - 8_000) {
    for (const company of await readCompanies(SEGMENT_SYMBOLS)) {
      const left = budgetMs - (Date.now() - started);
      if (left < 8_000) break;
      if (!segmentsDue(company)) continue;
      try {
        await refreshSegmentsIfDue(company, left - 5_000);
        processed.push({ symbol: company.symbol, result: "segments" });
      } catch (e) {
        processed.push({ symbol: company.symbol, result: `segments error: ${e instanceof Error ? e.message.slice(0, 80) : "unknown"}` });
      }
    }
  }
  return { processed, remaining: Math.max(0, queue.length - processed.length), ms: Date.now() - started };
}
