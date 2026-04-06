import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

/** DevTools: `window.__STOCK_BUNDLE__` — full last loaded bundle (when debug logging is on). */
declare global {
  interface Window {
    __STOCK_BUNDLE__?: StockAnalysisBundle | null;
    __STOCK_TICKER__?: string;
    __STOCK_BUNDLE_ERROR__?: string | null;
  }
}

/** `true` in development, or when URL has `?stockDebug=1`. */
export function isStockBundleDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    return new URLSearchParams(window.location.search).get("stockDebug") === "1";
  } catch {
    return false;
  }
}

/**
 * Logs the full bundle and shallow counts. Enable with dev server or `?stockDebug=1` on production.
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
