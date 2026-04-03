/**
 * Server-only: Yahoo Finance data via yahoo-finance2 (no API keys).
 * @see https://github.com/gadicc/yahoo-finance2
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  CashFlowAnnual,
  CashFlowQuarter,
  HistoricalEodBar,
  IncomeStatementAnnual,
  IncomeStatementQuarter,
  StockAnalysisBundle,
  StockQuote,
} from "@/lib/stockAnalysisTypes";

const yahooFinance = new YahooFinance();

const MAX_INCOME_YEARS = 5;
const MAX_QUARTERS = 24;

/**
 * Yahoo expects a trading symbol (e.g. NVDA), not a company name (e.g. NVIDIA).
 * If quote() does not resolve the string, fall back to search() and pick the first equity.
 */
async function resolveYahooSymbol(input: string): Promise<string> {
  const trimmed = input.trim();
  const sym = trimmed.toUpperCase();
  if (!sym) {
    throw new Error('Empty ticker.');
  }

  const quoteResult = await yahooFinance.quote(sym);
  const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
  if (q && (q as { quoteType?: string }).quoteType !== 'NONE') {
    return String((q as { symbol?: string }).symbol ?? sym).toUpperCase();
  }

  const searchResult = await yahooFinance.search(trimmed, { quotesCount: 15 });
  const hit = searchResult.quotes.find((row) => {
    if (typeof row !== 'object' || row === null || !('symbol' in row)) return false;
    const r = row as { symbol?: string; quoteType?: string; isYahooFinance?: boolean };
    return (
      r.isYahooFinance === true &&
      r.quoteType === 'EQUITY' &&
      typeof r.symbol === 'string'
    );
  }) as { symbol: string } | undefined;

  if (hit?.symbol) {
    return hit.symbol.toUpperCase();
  }

  throw new Error(
    `Ticker "${sym}" was not found. Use a Yahoo symbol (e.g. NVDA for NVIDIA).`,
  );
}

function mapQuote(symbol: string, q: {
  shortName?: string;
  longName?: string;
  symbol?: string;
  regularMarketPrice?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
}): StockQuote {
  const price = Number(q.regularMarketPrice ?? 0);
  const change = Number(q.regularMarketChange ?? 0);
  let pct = Number(q.regularMarketChangePercent ?? NaN);
  if (!Number.isFinite(pct)) {
    const prev = price - change;
    pct = prev !== 0 ? (change / prev) * 100 : 0;
  }
  return {
    symbol: (q.symbol ?? symbol).toUpperCase(),
    name: String(q.longName ?? q.shortName ?? symbol),
    price,
    change,
    changesPercentage: Number.isFinite(pct) ? pct : 0,
  };
}

function numField(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

type FinRow = {
  date: Date;
  totalRevenue?: number;
  grossProfit?: number;
  operatingExpense?: number;
  operatingIncome?: number;
  ebitda?: number;
  netIncome?: number;
  netIncomeCommonStockholders?: number;
};

function rowDateKey(row: { date: Date }): string {
  const d = row.date instanceof Date ? row.date : new Date(row.date as string);
  return d.toISOString().slice(0, 10);
}

function mapIncomeQuarter(symbol: string, row: FinRow): IncomeStatementQuarter {
  const revenue = row.totalRevenue ?? 0;
  const gp = row.grossProfit ?? 0;
  let opEx = row.operatingExpense;
  if (opEx === undefined && row.grossProfit !== undefined && row.operatingIncome !== undefined) {
    opEx = Math.max(0, row.grossProfit - row.operatingIncome);
  }
  opEx ??= 0;
  const ni = row.netIncome ?? row.netIncomeCommonStockholders ?? 0;
  const oi = numField(row.operatingIncome);
  const ebitda = numField(row.ebitda);
  const d = row.date instanceof Date ? row.date : new Date(row.date as string);
  return {
    date: d.toISOString().slice(0, 10),
    symbol,
    revenue,
    grossProfit: gp,
    operatingExpenses: opEx,
    netIncome: ni,
    ...(oi !== null ? { operatingIncome: oi } : {}),
    ...(ebitda !== null ? { ebitda } : {}),
  };
}

function emptyBalanceQuarter(symbol: string, inc: IncomeStatementQuarter): BalanceSheetQuarter {
  return {
    date: inc.date,
    symbol,
    totalAssets: null,
    totalDebt: null,
    netDebt: null,
    stockholdersEquity: null,
    cashAndCashEquivalents: null,
    totalCurrentAssets: null,
    totalCurrentLiabilities: null,
    inventory: null,
    accountsReceivable: null,
    goodwill: null,
    longTermDebt: null,
  };
}

function mapBalanceQuarter(symbol: string, row: BsRow): BalanceSheetQuarter {
  const d = row.date instanceof Date ? row.date : new Date(row.date as string);
  return {
    date: d.toISOString().slice(0, 10),
    symbol,
    totalAssets: numField(row.totalAssets),
    totalDebt: numField(row.totalDebt),
    netDebt: numField(row.netDebt),
    stockholdersEquity: numField(row.stockholdersEquity),
    cashAndCashEquivalents: numField(row.cashAndCashEquivalents),
    totalCurrentAssets: numField(row.totalCurrentAssets),
    totalCurrentLiabilities: numField(row.totalCurrentLiabilities),
    inventory: numField(row.inventory),
    accountsReceivable: numField(row.accountsReceivable),
    goodwill: numField(row.goodwill),
    longTermDebt: numField(row.longTermDebt),
  };
}

function mapIncomeRow(symbol: string, row: FinRow): IncomeStatementAnnual {
  const y = row.date.getFullYear();
  const revenue = row.totalRevenue ?? 0;
  const gp = row.grossProfit ?? 0;
  let opEx = row.operatingExpense;
  if (opEx === undefined && row.grossProfit !== undefined && row.operatingIncome !== undefined) {
    opEx = Math.max(0, row.grossProfit - row.operatingIncome);
  }
  opEx ??= 0;
  const ni = row.netIncome ?? row.netIncomeCommonStockholders ?? 0;
  const oi = numField(row.operatingIncome);
  const ebitda = numField(row.ebitda);
  return {
    date: row.date.toISOString().slice(0, 10),
    symbol,
    fiscalYear: String(y),
    revenue,
    grossProfit: gp,
    operatingExpenses: opEx,
    netIncome: ni,
    ...(oi !== null ? { operatingIncome: oi } : {}),
    ...(ebitda !== null ? { ebitda } : {}),
  };
}

type BsRow = {
  date: Date;
  totalAssets?: number;
  totalDebt?: number;
  netDebt?: number;
  stockholdersEquity?: number;
  cashAndCashEquivalents?: number;
  totalCurrentAssets?: number;
  totalCurrentLiabilities?: number;
  inventory?: number;
  accountsReceivable?: number;
  goodwill?: number;
  longTermDebt?: number;
};

function emptyBalanceSheet(symbol: string, inc: IncomeStatementAnnual): BalanceSheetAnnual {
  return {
    date: inc.date,
    symbol,
    fiscalYear: inc.fiscalYear,
    totalAssets: null,
    totalDebt: null,
    netDebt: null,
    stockholdersEquity: null,
    cashAndCashEquivalents: null,
    totalCurrentAssets: null,
    totalCurrentLiabilities: null,
    inventory: null,
    accountsReceivable: null,
    goodwill: null,
    longTermDebt: null,
  };
}

function mapBalanceRow(symbol: string, row: BsRow): BalanceSheetAnnual {
  const y = row.date.getFullYear();
  return {
    date: row.date.toISOString().slice(0, 10),
    symbol,
    fiscalYear: String(y),
    totalAssets: numField(row.totalAssets),
    totalDebt: numField(row.totalDebt),
    netDebt: numField(row.netDebt),
    stockholdersEquity: numField(row.stockholdersEquity),
    cashAndCashEquivalents: numField(row.cashAndCashEquivalents),
    totalCurrentAssets: numField(row.totalCurrentAssets),
    totalCurrentLiabilities: numField(row.totalCurrentLiabilities),
    inventory: numField(row.inventory),
    accountsReceivable: numField(row.accountsReceivable),
    goodwill: numField(row.goodwill),
    longTermDebt: numField(row.longTermDebt),
  };
}

type CfRow = {
  date: Date;
  freeCashFlow?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  cashDividendsPaid?: number;
  repurchaseOfCapitalStock?: number;
};

const DAILY_HISTORY_START = "1990-01-01";

export async function fetchStockAnalysisFromYahoo(symbol: string): Promise<StockAnalysisBundle> {
  const sym = await resolveYahooSymbol(symbol);
  const period2 = new Date();
  const period2Str = period2.toISOString().slice(0, 10);
  const period1Long = DAILY_HISTORY_START;

  const intradayPeriod1 = new Date(period2);
  intradayPeriod1.setDate(intradayPeriod1.getDate() - 7);

  const quarterPeriod1 = "2018-01-01";

  const [
    quoteResult,
    historicalResult,
    financialsResult,
    cashResult,
    balanceSheetResult,
    financialsQuarterlyResult,
    cashQuarterlyResult,
    balanceSheetQuarterlyResult,
    chartIntraday,
    quoteSummaryResult,
  ] = await Promise.all([
    yahooFinance.quote(sym),
    yahooFinance.historical(sym, {
      period1: period1Long,
      period2: period2Str,
      interval: "1d",
    }),
    yahooFinance.fundamentalsTimeSeries(sym, {
      period1: "2010-01-01",
      period2: period2Str,
      type: "annual",
      module: "financials",
    }),
    yahooFinance.fundamentalsTimeSeries(sym, {
      period1: "2010-01-01",
      period2: period2Str,
      type: "annual",
      module: "cash-flow",
    }),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: "2010-01-01",
        period2: period2Str,
        type: "annual",
        module: "balance-sheet",
      })
      .catch(() => [] as BsRow[]),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: quarterPeriod1,
        period2: period2Str,
        type: "quarterly",
        module: "financials",
      })
      .catch(() => [] as FinRow[]),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: quarterPeriod1,
        period2: period2Str,
        type: "quarterly",
        module: "cash-flow",
      })
      .catch(() => [] as CfRow[]),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: quarterPeriod1,
        period2: period2Str,
        type: "quarterly",
        module: "balance-sheet",
      })
      .catch(() => [] as BsRow[]),
    yahooFinance
      .chart(sym, {
        period1: intradayPeriod1,
        period2: period2,
        interval: "5m",
        return: "array",
      })
      .catch(() => null),
    yahooFinance
      .quoteSummary(sym, {
        modules: ["financialData", "defaultKeyStatistics", "summaryDetail"],
      })
      .catch(() => null),
  ]);

  const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
  if (!q || (q as { quoteType?: string }).quoteType === "NONE") {
    throw new Error(`Ticker "${sym}" was not found.`);
  }

  const rawQuote = q as Record<string, unknown>;
  const quote = mapQuote(sym, q as Parameters<typeof mapQuote>[1]);
  const investor = mapInvestorMetrics(
    rawQuote,
    quoteSummaryResult && typeof quoteSummaryResult === "object"
      ? (quoteSummaryResult as Record<string, unknown>)
      : null,
  );

  const finRows = (financialsResult as FinRow[])
    .filter((r) => r.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const recentFin = finRows.slice(-MAX_INCOME_YEARS);
  const income: IncomeStatementAnnual[] = recentFin.map((row) => mapIncomeRow(sym, row));

  if (income.length === 0) {
    throw new Error(`No annual income statement data for "${sym}".`);
  }

  const cfByYear = new Map<number, CfRow>();
  for (const row of cashResult as CfRow[]) {
    if (!row?.date) continue;
    cfByYear.set(row.date.getFullYear(), row);
  }

  const cashFlow: CashFlowAnnual[] = income.map((row) => {
    const cf = cfByYear.get(Number(row.fiscalYear));
    const fcfRaw = cf?.freeCashFlow;
    const freeCashFlow =
      fcfRaw !== undefined && Number.isFinite(Number(fcfRaw))
        ? Number(fcfRaw)
        : Math.max(0, row.netIncome * 0.85);
    return {
      date: row.date,
      symbol: sym,
      fiscalYear: row.fiscalYear,
      freeCashFlow,
      operatingCashFlow: numField(cf?.operatingCashFlow),
      capitalExpenditure: numField(cf?.capitalExpenditure),
      investingCashFlow: numField(cf?.investingCashFlow),
      financingCashFlow: numField(cf?.financingCashFlow),
      dividendsPaid: numField(cf?.cashDividendsPaid),
      stockRepurchase: numField(cf?.repurchaseOfCapitalStock),
    };
  });

  const bsRows = (balanceSheetResult as BsRow[])
    .filter((r) => r?.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const bsByYear = new Map<number, BsRow>();
  for (const r of bsRows) {
    bsByYear.set(r.date.getFullYear(), r);
  }
  const balanceSheet: BalanceSheetAnnual[] = income.map((inc) => {
    const r = bsByYear.get(Number(inc.fiscalYear));
    if (!r) return emptyBalanceSheet(sym, inc);
    return mapBalanceRow(sym, r);
  });

  const finQRows = (financialsQuarterlyResult as FinRow[])
    .filter((r) => r?.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(-MAX_QUARTERS);
  const incomeQuarterly: IncomeStatementQuarter[] = finQRows.map((row) => mapIncomeQuarter(sym, row));

  const cfQByDate = new Map<string, CfRow>();
  for (const row of cashQuarterlyResult as CfRow[]) {
    if (!row?.date) continue;
    cfQByDate.set(rowDateKey(row), row);
  }

  const cashFlowQuarterly: CashFlowQuarter[] = incomeQuarterly.map((row) => {
    const cf = cfQByDate.get(row.date.slice(0, 10));
    const fcfRaw = cf?.freeCashFlow;
    const freeCashFlow =
      fcfRaw !== undefined && Number.isFinite(Number(fcfRaw))
        ? Number(fcfRaw)
        : Math.max(0, row.netIncome * 0.85);
    return {
      date: row.date,
      symbol: sym,
      freeCashFlow,
      operatingCashFlow: numField(cf?.operatingCashFlow),
      capitalExpenditure: numField(cf?.capitalExpenditure),
      investingCashFlow: numField(cf?.investingCashFlow),
      financingCashFlow: numField(cf?.financingCashFlow),
      dividendsPaid: numField(cf?.cashDividendsPaid),
      stockRepurchase: numField(cf?.repurchaseOfCapitalStock),
    };
  });

  const bsQByDate = new Map<string, BsRow>();
  for (const row of balanceSheetQuarterlyResult as BsRow[]) {
    if (!row?.date) continue;
    bsQByDate.set(rowDateKey(row), row);
  }

  const balanceSheetQuarterly: BalanceSheetQuarter[] = incomeQuarterly.map((inc) => {
    const r = bsQByDate.get(inc.date.slice(0, 10));
    if (!r) return emptyBalanceQuarter(sym, inc);
    return mapBalanceQuarter(sym, r);
  });

  const histArr = historicalResult as Array<{
    date: Date;
    close?: number;
    high?: number;
    low?: number;
    volume?: number;
  }>;
  const historical: HistoricalEodBar[] = (histArr ?? [])
    .filter((h) => h?.date && h.close !== undefined)
    .map((h) => {
      const d =
        h.date instanceof Date
          ? h.date.toISOString().slice(0, 10)
          : String(h.date).slice(0, 10);
      return {
        date: d,
        close: Number(h.close),
        high: h.high !== undefined ? Number(h.high) : undefined,
        low: h.low !== undefined ? Number(h.low) : undefined,
        volume: h.volume !== undefined ? Number(h.volume) : undefined,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  if (historical.length === 0) {
    const d = new Date().toISOString().slice(0, 10);
    historical.push({ date: d, close: quote.price });
  }

  let intraday: HistoricalEodBar[] | undefined;
  if (chartIntraday && typeof chartIntraday === "object" && "quotes" in chartIntraday) {
    const quotes = (chartIntraday as { quotes: Array<{ date: Date; close?: number | null }> })
      .quotes;
    intraday = (quotes ?? [])
      .filter((q) => q?.date && q.close != null && Number.isFinite(Number(q.close)))
      .map((q) => ({
        date:
          q.date instanceof Date ? q.date.toISOString() : String(q.date),
        close: Number(q.close),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
    if (intraday.length === 0) intraday = undefined;
  }

  return {
    quote,
    income,
    cashFlow,
    balanceSheet,
    incomeQuarterly,
    cashFlowQuarterly,
    balanceSheetQuarterly,
    historical,
    intraday,
    investor,
  };
}
