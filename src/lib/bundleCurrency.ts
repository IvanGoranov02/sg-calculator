/**
 * Currency reconciliation for foreign issuers / ADRs whose reporting currency
 * differs from the trading currency (e.g. ASML files in EUR but the NASDAQ ADR
 * quotes in USD). Fundamentals come out in the financial currency; the price and
 * investor metrics in the quote currency. Mixing them breaks P/E, valuation and
 * the charts, so we scale the monetary fundamentals into the quote currency for
 * display (a single current FX rate — an approximation, good enough for the UI).
 */

import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  CashFlowAnnual,
  CashFlowQuarter,
  IncomeStatementAnnual,
  IncomeStatementQuarter,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

/** Multiply a monetary value by the FX rate, preserving null. */
function s(v: number | null, rate: number): number | null {
  return v == null || !Number.isFinite(v) ? v : v * rate;
}
/** Required (non-null) monetary field. */
function sReq(v: number, rate: number): number {
  return Number.isFinite(v) ? v * rate : v;
}
/** Optional monetary field (number | undefined). */
function sOpt(v: number | undefined, rate: number): number | undefined {
  return v == null || !Number.isFinite(v) ? v : v * rate;
}

/**
 * In-place: convert every monetary fundamental field (and per-share figures) by
 * `rate` = quote-currency units per 1 financial-currency unit. Share *counts*
 * (diluted average shares) are NOT scaled. Mutates and returns the bundle.
 */
export function convertBundleFundamentals(bundle: StockAnalysisBundle, rate: number): StockAnalysisBundle {
  if (!Number.isFinite(rate) || rate <= 0 || rate === 1) return bundle;

  const income = <T extends IncomeStatementAnnual | IncomeStatementQuarter>(r: T): T =>
    ({
      ...r,
      revenue: sReq(r.revenue, rate),
      grossProfit: sReq(r.grossProfit, rate),
      operatingExpenses: sReq(r.operatingExpenses, rate),
      netIncome: sReq(r.netIncome, rate),
      operatingIncome: sOpt(r.operatingIncome, rate),
      ebitda: sOpt(r.ebitda, rate),
      dilutedEps: sOpt(r.dilutedEps, rate),
      // dilutedAverageShares is a count — left as is.
    }) as T;

  const cf = <T extends CashFlowAnnual | CashFlowQuarter>(r: T): T =>
    ({
      ...r,
      freeCashFlow: sReq(r.freeCashFlow, rate),
      operatingCashFlow: s(r.operatingCashFlow, rate),
      capitalExpenditure: s(r.capitalExpenditure, rate),
      investingCashFlow: s(r.investingCashFlow, rate),
      financingCashFlow: s(r.financingCashFlow, rate),
      dividendsPaid: s(r.dividendsPaid, rate),
      stockRepurchase: s(r.stockRepurchase, rate),
    }) as T;

  const bs = <T extends BalanceSheetAnnual | BalanceSheetQuarter>(r: T): T =>
    ({
      ...r,
      totalAssets: s(r.totalAssets, rate),
      totalDebt: s(r.totalDebt, rate),
      netDebt: s(r.netDebt, rate),
      stockholdersEquity: s(r.stockholdersEquity, rate),
      cashAndCashEquivalents: s(r.cashAndCashEquivalents, rate),
      totalCurrentAssets: s(r.totalCurrentAssets, rate),
      totalCurrentLiabilities: s(r.totalCurrentLiabilities, rate),
      inventory: s(r.inventory, rate),
      accountsReceivable: s(r.accountsReceivable, rate),
      goodwill: s(r.goodwill, rate),
      longTermDebt: s(r.longTermDebt, rate),
    }) as T;

  bundle.income = bundle.income.map(income);
  bundle.incomeQuarterly = bundle.incomeQuarterly.map(income);
  bundle.cashFlow = bundle.cashFlow.map(cf);
  bundle.cashFlowQuarterly = bundle.cashFlowQuarterly.map(cf);
  bundle.balanceSheet = bundle.balanceSheet.map(bs);
  bundle.balanceSheetQuarterly = bundle.balanceSheetQuarterly.map(bs);
  bundle.dividendQuarterly = bundle.dividendQuarterly.map((p) => ({
    ...p,
    dividendPerShare: s(p.dividendPerShare, rate),
  }));

  return bundle;
}
