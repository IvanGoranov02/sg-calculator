import type { ChartTimeRange } from "@/lib/stockAnalysisPeriod";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

/** DevTools: `window.__STOCK_BUNDLE__` — full last loaded bundle (when debug logging is on). */
declare global {
  interface Window {
    __STOCK_BUNDLE__?: StockAnalysisBundle | null;
    __STOCK_TICKER__?: string;
    __STOCK_BUNDLE_ERROR__?: string | null;
  }
}

const STOCK_DEBUG_LS = "stockDebug";

/**
 * Stock bundle / fundamentals console logging.
 * On: local dev (`next dev`), or production when any of:
 * - `NEXT_PUBLIC_STOCK_DEBUG=1` (e.g. Vercel env),
 * - URL query `?stockDebug=1`,
 * - `localStorage.setItem("stockDebug", "1")` then reload.
 */
export function isStockBundleDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_STOCK_DEBUG === "1") return true;
  try {
    if (new URLSearchParams(window.location.search).get("stockDebug") === "1") return true;
  } catch {
    /* ignore */
  }
  try {
    if (window.localStorage.getItem(STOCK_DEBUG_LS) === "1") return true;
  } catch {
    /* private mode / blocked storage */
  }
  return false;
}

/**
 * Logs the full bundle and shallow counts. See {@link isStockBundleDebugEnabled}.
 */
export function debugLogStockBundle(
  ticker: string,
  bundle: StockAnalysisBundle | null,
  error: string | null,
): void {
  if (!isStockBundleDebugEnabled()) return;

  window.__STOCK_TICKER__ = ticker;
  window.__STOCK_BUNDLE__ = bundle;
  window.__STOCK_BUNDLE_ERROR__ = error;

  const title = `[stock-analysis] ${ticker}`;
  console.groupCollapsed(`${title} — loaded payload`);
  console.log("ticker:", ticker);
  console.log("error:", error ?? null);
  if (bundle) {
    console.log("quote:", bundle.quote);
    console.log("investor:", bundle.investor);
    console.log("income (annual):", bundle.income.length, bundle.income);
    console.log("cashFlow (annual):", bundle.cashFlow.length, bundle.cashFlow);
    console.log("balanceSheet (annual):", bundle.balanceSheet.length, bundle.balanceSheet);
    console.log("incomeQuarterly:", bundle.incomeQuarterly.length, bundle.incomeQuarterly);
    console.log("cashFlowQuarterly:", bundle.cashFlowQuarterly.length, bundle.cashFlowQuarterly);
    console.log("balanceSheetQuarterly:", bundle.balanceSheetQuarterly.length, bundle.balanceSheetQuarterly);
    console.log("dividendQuarterly:", bundle.dividendQuarterly.length, bundle.dividendQuarterly);
    console.log("historical:", bundle.historical.length, "daily bars");
    console.log("intraday:", bundle.intraday?.length ?? 0, "bars");
    console.log("— full bundle object (expand in console) —", bundle);
  } else {
    console.log("bundle: null");
  }
  console.groupEnd();
}

const FUNDAMENTALS_DEBUG_METRIC_KEYS = [
  "revenue",
  "grossProfit",
  "netIncome",
  "operatingIncome",
  "dilutedEps",
  "dilutedShares",
  "peTtm",
  "psTtm",
] as const;

function fundamentalsMetricNonNullStats(
  rows: Record<string, unknown>[],
  keys: readonly string[],
): Record<string, { nonNull: number; total: number }> {
  const out: Record<string, { nonNull: number; total: number }> = {};
  for (const k of keys) {
    let nn = 0;
    for (const r of rows) {
      const v = r[k];
      if (v == null || v === "") continue;
      if (typeof v === "number" && !Number.isFinite(v)) continue;
      nn++;
    }
    out[k] = { nonNull: nn, total: rows.length };
  }
  return out;
}

export type FundamentalsPipelineDebugPayload = {
  freq: "annual" | "quarterly";
  timeRange: ChartTimeRange;
  customFromYear: number | null;
  customToYear: number | null;
  rawAnnualIncomeCount: number;
  rawQuarterlyIncomeCount: number;
  annualFiscalYearsInBundle: string[];
  quarterlyPeriodEndsSample: string[];
  annualRowsAfterTimeFilter: number | null;
  annualFiscalYearsAfterTimeFilter: string[] | null;
  baseRowsCount: number;
  filteredRowsCount: number;
  chartRows: Record<string, unknown>[];
  visibleLabels: string[];
};

/**
 * Logs how raw Yahoo rows become chart rows (filters + per-metric non-null counts).
 * See {@link isStockBundleDebugEnabled}.
 */
export function debugLogFundamentalsPipeline(symbol: string, payload: FundamentalsPipelineDebugPayload): void {
  if (!isStockBundleDebugEnabled()) return;

  const metrics = fundamentalsMetricNonNullStats(payload.chartRows, [...FUNDAMENTALS_DEBUG_METRIC_KEYS]);
  const title = `[stock-analysis] ${symbol}`;
  console.groupCollapsed(`${title} — fundamentals charts (${payload.freq})`);
  console.log("period", {
    timeRange: payload.timeRange,
    customFromYear: payload.customFromYear,
    customToYear: payload.customToYear,
  });
  console.log("raw bundle counts", {
    annualIncomeRows: payload.rawAnnualIncomeCount,
    quarterlyIncomeRows: payload.rawQuarterlyIncomeCount,
  });
  console.log("annual fiscal years (all loaded)", payload.annualFiscalYearsInBundle);
  console.log("quarterly period-ends (sample)", payload.quarterlyPeriodEndsSample);
  if (payload.freq === "annual") {
    console.log("annual after time filter", {
      rowCount: payload.annualRowsAfterTimeFilter,
      fiscalYears: payload.annualFiscalYearsAfterTimeFilter,
    });
  }
  console.log("pipeline row counts", {
    baseRows: payload.baseRowsCount,
    afterPeriodFilter: payload.filteredRowsCount,
    chartRows: payload.chartRows.length,
  });
  console.log("visible labels (x-axis)", payload.visibleLabels);
  console.log(
    "metric non-null counts (if revenue nonNull=0 but netIncome>0, Yahoo omitted revenue line items for those filings)",
    metrics,
  );
  console.log("chart rows (full array — expand in console)", payload.chartRows);
  console.groupEnd();
}
