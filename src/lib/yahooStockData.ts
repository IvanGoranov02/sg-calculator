/**
 * Server-only: Yahoo Finance data via yahoo-finance2 (no API keys).
 * @see https://github.com/gadicc/yahoo-finance2
 */

import YahooFinance from "yahoo-finance2";

import { mapInvestorMetrics } from "@/lib/mapInvestorMetrics";
import { applyGeminiFundamentalGaps } from "@/lib/geminiFundamentalsGapFill";
import { fetchSecQuarterlyFundamentals } from "@/lib/secQuarterlyIncome";
import {
  isEmptyIncomeStatementCore,
  type BalanceSheetAnnual,
  type BalanceSheetQuarter,
  type CashFlowAnnual,
  type CashFlowQuarter,
  type DividendQuarterlyPoint,
  type HistoricalEodBar,
  type IncomeStatementAnnual,
  type IncomeStatementQuarter,
  type StockAnalysisBundle,
  type StockQuote,
} from "@/lib/stockAnalysisTypes";

const yahooFinance = new YahooFinance({ suppressNotices: ["ripHistorical"] });

const MAX_INCOME_YEARS = 15;
const FUNDAMENTALS_PERIOD1 = "2000-01-01";
/** Include quarterly periods from this date onward when Yahoo returns a long history (avoids tiny “last N” windows). */
const QUARTERLY_INCLUDE_FROM = new Date("2022-01-01T00:00:00.000Z");

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

function toIsoDate(d: unknown): string | null {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(String(d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function pickNextEarningsFromCalendar(qs: Record<string, unknown> | null): string | null {
  if (!qs) return null;
  const ce = qs.calendarEvents as { earnings?: { earningsDate?: Date[] } } | undefined;
  const dates = ce?.earnings?.earningsDate;
  if (!Array.isArray(dates) || dates.length === 0) return null;
  const parsed = dates
    .map((x) => (x instanceof Date ? x : new Date(x as string)))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (parsed.length === 0) return null;
  const t0 = Date.now() - 86400000;
  const upcoming = parsed.filter((d) => d.getTime() >= t0).sort((a, b) => a.getTime() - b.getTime());
  const pick = upcoming[0] ?? parsed[parsed.length - 1];
  return pick.toISOString().slice(0, 10);
}

function mapQuote(symbol: string, raw: Record<string, unknown>): StockQuote {
  const q = raw;
  const price = Number(q.regularMarketPrice ?? 0);
  const change = Number(q.regularMarketChange ?? 0);
  let pct = Number(q.regularMarketChangePercent ?? NaN);
  if (!Number.isFinite(pct)) {
    const prev = price - change;
    pct = prev !== 0 ? (change / prev) * 100 : 0;
  }
  const earningsDate =
    toIsoDate(q.earningsTimestamp) ??
    toIsoDate(q.earningsTimestampStart) ??
    null;

  return {
    symbol: String((q.symbol ?? symbol) as string).toUpperCase(),
    name: String(q.longName ?? q.shortName ?? symbol),
    price,
    change,
    changesPercentage: Number.isFinite(pct) ? pct : 0,
    marketState: typeof q.marketState === "string" ? q.marketState : undefined,
    postMarketPrice: numField(q.postMarketPrice),
    postMarketChange: numField(q.postMarketChange),
    postMarketChangePercent: numField(q.postMarketChangePercent),
    preMarketPrice: numField(q.preMarketPrice),
    preMarketChange: numField(q.preMarketChange),
    preMarketChangePercent: numField(q.preMarketChangePercent),
    earningsDate,
  };
}

function numField(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Yahoo sometimes labels EBITDA differently across filers / annual vs quarterly. */
function pickEbitda(row: FinRow): number | null {
  const r = row as Record<string, unknown>;
  return (
    numField(row.ebitda) ??
    numField(r.EBITDA) ??
    numField(r.normalizedEBITDA) ??
    numField(r.NormalizedEBITDA)
  );
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
  dividendPerShare?: number;
  dilutedEPS?: number;
  normalizedDilutedEPS?: number;
  dilutedAverageShares?: number;
  basicAverageShares?: number;
};

function rowDateKey(row: { date: Date }): string {
  const d = row.date instanceof Date ? row.date : new Date(row.date as string);
  return d.toISOString().slice(0, 10);
}

/**
 * Yahoo often uses slightly different period-end dates for income vs balance-sheet in the same quarter.
 * Exact date keys then miss every row — charts show no BS metrics while cash flow (matched separately) works.
 */
const NEAREST_BS_QUARTER_DAYS = 45;
const NEAREST_BS_ANNUAL_DAYS = 120;

function nearestBsRowByDate(targetIso: string, rows: BsRow[], maxDays: number): BsRow | null {
  const target = new Date(`${targetIso}T12:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  let best: BsRow | null = null;
  let bestDays = Infinity;
  for (const r of rows) {
    if (!r?.date) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    if (Number.isNaN(d.getTime())) continue;
    const days = Math.abs(d.getTime() - target) / 86400000;
    if (days <= maxDays && days < bestDays) {
      bestDays = days;
      best = r;
    }
  }
  return best;
}

type DividendEventRow = { date: Date; dividends: number };

/** Server logs for dividend pipeline (dev by default; prod: set DEBUG_YAHOO_DIVIDENDS=1). */
function shouldLogYahooDividends(): boolean {
  if (process.env.DEBUG_YAHOO_DIVIDENDS === "0") return false;
  return process.env.NODE_ENV === "development" || process.env.DEBUG_YAHOO_DIVIDENDS === "1";
}

function logYahooDividends(symbol: string, message: string, extra?: unknown): void {
  if (!shouldLogYahooDividends()) return;
  const prefix = `[sg-calculator:yahoo-dividends:${symbol}]`;
  if (extra !== undefined) {
    console.log(prefix, message, extra);
  } else {
    console.log(prefix, message);
  }
}

/**
 * Yahoo chart() exposes dividends as `{ amount, date }` (array mode). Normalize to our row shape.
 * @see https://github.com/gadicc/yahoo-finance2/blob/dev/src/modules/chart.d.ts — prefer chart when historical is flaky (issue #795).
 */
function dividendEventsFromChartArray(chart: unknown): DividendEventRow[] {
  if (!chart || typeof chart !== "object") return [];
  const ev = (chart as { events?: { dividends?: unknown } }).events?.dividends;
  if (ev == null) return [];
  const list = Array.isArray(ev) ? ev : Object.values(ev as Record<string, unknown>);
  const out: DividendEventRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const o = item as { date?: Date | string | number; amount?: unknown; dividends?: unknown };
    const d = o.date instanceof Date ? o.date : new Date(o.date as string | number);
    const amt = Number(o.amount ?? o.dividends);
    if (!Number.isFinite(d.getTime()) || !Number.isFinite(amt)) continue;
    out.push({ date: d, dividends: amt });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function mergeDividendEvents(a: DividendEventRow[], b: DividendEventRow[]): DividendEventRow[] {
  const map = new Map<string, DividendEventRow>();
  for (const e of [...a, ...b]) {
    const d = e.date instanceof Date ? e.date : new Date(e.date as string);
    if (!Number.isFinite(d.getTime())) continue;
    const k = d.toISOString().slice(0, 10);
    const amt = Number(e.dividends);
    if (!Number.isFinite(amt)) continue;
    if (!map.has(k)) map.set(k, { date: d, dividends: amt });
  }
  return [...map.values()].sort((x, y) => x.date.getTime() - y.date.getTime());
}

function indexOfFinQuarter(rows: FinRow[], row: FinRow): number {
  const key = rowDateKey(row);
  const i = rows.findIndex((r) => rowDateKey(r) === key);
  return i;
}

function utcDayNumber(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Sum per-share dividends on ex-dates in (startExclusive, endInclusive] using UTC calendar days.
 * Matches Yahoo fiscal quarter rows: ex-dates belong to the period after the previous report date.
 */
function dividendSumInWindow(
  events: DividendEventRow[],
  startExclusive: Date,
  endInclusive: Date,
): number {
  const startN = utcDayNumber(startExclusive);
  const endN = utcDayNumber(endInclusive);
  let s = 0;
  for (const e of events) {
    const d = e.date instanceof Date ? e.date : new Date(e.date as string);
    if (!Number.isFinite(d.getTime())) continue;
    const n = utcDayNumber(d);
    if (n <= startN || n > endN) continue;
    const amt = Number(e.dividends);
    if (Number.isFinite(amt)) s += amt;
  }
  return s;
}

/** Fallback: same calendar quarter as `periodEnd` (UTC) — used only for the earliest quarter in the series. */
function dividendPerShareFromHistory(periodEnd: Date, events: DividendEventRow[]): number {
  const y = periodEnd.getUTCFullYear();
  const q0 = Math.floor(periodEnd.getUTCMonth() / 3);
  let s = 0;
  for (const e of events) {
    const d = e.date instanceof Date ? e.date : new Date(e.date as string);
    if (!Number.isFinite(d.getTime())) continue;
    if (d.getUTCFullYear() !== y) continue;
    if (Math.floor(d.getUTCMonth() / 3) !== q0) continue;
    const amt = Number(e.dividends);
    if (Number.isFinite(amt)) s += amt;
  }
  return s;
}

function pickQuarterlyDps(
  finRow: FinRow,
  periodEnd: Date,
  divEvents: DividendEventRow[],
  fiscalPrevEndExclusive: Date | null,
): number | null {
  const fromFin =
    numField(finRow.dividendPerShare) ??
    numField((finRow as Record<string, unknown>).quarterlyDividendPerShare);
  let fromHist =
    fiscalPrevEndExclusive != null
      ? dividendSumInWindow(divEvents, fiscalPrevEndExclusive, periodEnd)
      : dividendPerShareFromHistory(periodEnd, divEvents);
  // If fiscal window is empty but ex-dates align with calendar quarter of period end, use that (reduces gaps for odd filers).
  if (fromHist === 0 && fiscalPrevEndExclusive != null) {
    const cal = dividendPerShareFromHistory(periodEnd, divEvents);
    if (cal > 0) fromHist = cal;
  }
  if (fromFin != null && fromFin > 0) return fromFin;
  if (fromHist > 0) return fromHist;
  if (fromFin != null) return fromFin > 0 ? fromFin : null;
  return null;
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
  const ebitda = pickEbitda(row);
  const dilEps = numField(row.dilutedEPS ?? row.normalizedDilutedEPS);
  const dilSh = numField((row as Record<string, unknown>).dilutedAverageShares ?? row.dilutedAverageShares);
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
    ...(dilEps !== null ? { dilutedEps: dilEps } : {}),
    ...(dilSh !== null ? { dilutedAverageShares: dilSh } : {}),
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
    totalCurrentAssets: bsCurrentAssets(row),
    totalCurrentLiabilities: bsCurrentLiabilities(row),
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
  const ebitda = pickEbitda(row);
  const dilEps = numField(row.dilutedEPS ?? row.normalizedDilutedEPS);
  const dilSh = numField((row as Record<string, unknown>).dilutedAverageShares ?? row.dilutedAverageShares);
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
    ...(dilEps !== null ? { dilutedEps: dilEps } : {}),
    ...(dilSh !== null ? { dilutedAverageShares: dilSh } : {}),
  };
}

type BsRow = {
  date: Date;
  totalAssets?: number;
  totalDebt?: number;
  netDebt?: number;
  stockholdersEquity?: number;
  cashAndCashEquivalents?: number;
  /** US-style naming in some responses. */
  totalCurrentAssets?: number;
  totalCurrentLiabilities?: number;
  /** Yahoo timeseries uses these for many IFRS / non-US filers (see CurrentAssets in timeseries keys). */
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  accountsReceivable?: number;
  goodwill?: number;
  longTermDebt?: number;
};

function bsCurrentAssets(row: BsRow): number | null {
  return numField(row.totalCurrentAssets ?? row.currentAssets);
}

function bsCurrentLiabilities(row: BsRow): number | null {
  return numField(row.totalCurrentLiabilities ?? row.currentLiabilities);
}

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
    totalCurrentAssets: bsCurrentAssets(row),
    totalCurrentLiabilities: bsCurrentLiabilities(row),
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

const NEAREST_QUARTER_CF_DAYS = 75;

function quarterDaysApart(a: string, b: string): number {
  return Math.abs(
    (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86400000,
  );
}

function nearestDividendMatch(
  target: string,
  oldIncome: IncomeStatementQuarter[],
  oldDiv: DividendQuarterlyPoint[],
  maxDays: number,
): number | null {
  let bestIdx = -1;
  let bestD = maxDays + 1;
  for (let i = 0; i < oldIncome.length; i++) {
    const d = quarterDaysApart(target, oldIncome[i].date.slice(0, 10));
    if (d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0 || bestD > maxDays) return null;
  const v = oldDiv[bestIdx]?.dividendPerShare;
  return v != null && Number.isFinite(v) ? v : null;
}

/** Replace Yahoo short quarterly windows with SEC 10-Q + derived Q4 when SEC has more history. */
async function enrichQuarterlyFromSecWhenDeep(sym: string, bundle: StockAnalysisBundle): Promise<void> {
  let sec: Awaited<ReturnType<typeof fetchSecQuarterlyFundamentals>> = null;
  try {
    sec = await fetchSecQuarterlyFundamentals(sym);
  } catch {
    return;
  }
  if (!sec?.income.length) return;

  if (sec.income.length <= bundle.incomeQuarterly.length) return;

  const oldInc = bundle.incomeQuarterly;
  const oldDiv = bundle.dividendQuarterly;

  bundle.incomeQuarterly = sec.income;
  bundle.cashFlowQuarterly = sec.cashFlow;
  bundle.balanceSheetQuarterly = sec.balanceSheet;

  bundle.dividendQuarterly = sec.income.map((row) => ({
    date: row.date,
    dividendPerShare: nearestDividendMatch(row.date.slice(0, 10), oldInc, oldDiv, NEAREST_QUARTER_CF_DAYS),
  }));

}

export async function fetchStockAnalysisFromYahoo(symbol: string): Promise<StockAnalysisBundle> {
  const sym = await resolveYahooSymbol(symbol);
  const period2 = new Date();
  const period2Str = period2.toISOString().slice(0, 10);
  const period1Long = DAILY_HISTORY_START;

  const intradayPeriod1 = new Date(period2);
  intradayPeriod1.setDate(intradayPeriod1.getDate() - 7);

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
    dividendHistoryResult,
    dividendChartResult,
  ] = await Promise.all([
    yahooFinance.quote(sym),
    yahooFinance.historical(sym, {
      period1: period1Long,
      period2: period2Str,
      interval: "1d",
    }),
    yahooFinance.fundamentalsTimeSeries(sym, {
      period1: FUNDAMENTALS_PERIOD1,
      period2: period2Str,
      type: "annual",
      module: "financials",
    }),
    yahooFinance.fundamentalsTimeSeries(sym, {
      period1: FUNDAMENTALS_PERIOD1,
      period2: period2Str,
      type: "annual",
      module: "cash-flow",
    }),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: FUNDAMENTALS_PERIOD1,
        period2: period2Str,
        type: "annual",
        module: "balance-sheet",
      })
      .catch(() => [] as BsRow[]),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: FUNDAMENTALS_PERIOD1,
        period2: period2Str,
        type: "quarterly",
        module: "financials",
      })
      .catch(() => [] as FinRow[]),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: FUNDAMENTALS_PERIOD1,
        period2: period2Str,
        type: "quarterly",
        module: "cash-flow",
      })
      .catch(() => [] as CfRow[]),
    yahooFinance
      .fundamentalsTimeSeries(sym, {
        period1: FUNDAMENTALS_PERIOD1,
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
        modules: ["financialData", "defaultKeyStatistics", "summaryDetail", "calendarEvents"],
      })
      .catch(() => null),
    yahooFinance
      .historical(sym, {
        period1: FUNDAMENTALS_PERIOD1,
        period2: period2Str,
        events: "dividends",
      })
      .catch((err: unknown) => {
        logYahooDividends(sym, "historical(dividends) failed (library may map to chart; see chart fallback)", err);
        return [] as DividendEventRow[];
      }),
    yahooFinance
      .chart(sym, {
        period1: FUNDAMENTALS_PERIOD1,
        period2: period2,
        interval: "1d",
        events: "div",
        return: "array",
      })
      .catch((err: unknown) => {
        logYahooDividends(sym, "chart(events=div) failed", err);
        return null;
      }),
  ]);

  const q = Array.isArray(quoteResult) ? quoteResult[0] : quoteResult;
  if (!q || (q as { quoteType?: string }).quoteType === "NONE") {
    throw new Error(`Ticker "${sym}" was not found.`);
  }

  const rawQuote = q as Record<string, unknown>;
  const qs =
    quoteSummaryResult && typeof quoteSummaryResult === "object"
      ? (quoteSummaryResult as Record<string, unknown>)
      : null;
  let quote = mapQuote(sym, rawQuote);
  if (!quote.earningsDate && qs) {
    const fromCal = pickNextEarningsFromCalendar(qs);
    if (fromCal) quote = { ...quote, earningsDate: fromCal };
  }
  const investor = mapInvestorMetrics(rawQuote, qs);

  const finRows = (financialsResult as FinRow[])
    .filter((r) => r.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const recentFin = finRows.slice(-MAX_INCOME_YEARS);
  const income: IncomeStatementAnnual[] = recentFin
    .map((row) => mapIncomeRow(sym, row))
    .filter((r) => !isEmptyIncomeStatementCore(r));

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
    if (r) return mapBalanceRow(sym, r);
    const nearest = nearestBsRowByDate(inc.date.slice(0, 10), bsRows, NEAREST_BS_ANNUAL_DAYS);
    if (nearest) return mapBalanceRow(sym, nearest);
    return emptyBalanceSheet(sym, inc);
  });

  const finQSorted = (financialsQuarterlyResult as FinRow[])
    .filter((r) => r?.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const finQFrom2022 = finQSorted.filter((r) => {
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    return d >= QUARTERLY_INCLUDE_FROM;
  });
  const finQRows = finQFrom2022.length > 0 ? finQFrom2022 : finQSorted;
  const quarterlyPairs = finQRows.map((row) => ({
    inc: mapIncomeQuarter(sym, row),
    row,
  }));
  const quarterlyKept = quarterlyPairs.filter(({ inc }) => !isEmptyIncomeStatementCore(inc));
  const incomeQuarterly: IncomeStatementQuarter[] = quarterlyKept.map(({ inc }) => inc);

  const fromHistorical = (dividendHistoryResult as DividendEventRow[]).filter(
    (e) => e?.date && e.dividends != null && Number.isFinite(Number(e.dividends)),
  );
  const fromChart = dividendEventsFromChartArray(dividendChartResult);
  const divEvents: DividendEventRow[] = mergeDividendEvents(fromHistorical, fromChart);

  const dividendQuarterly: DividendQuarterlyPoint[] = quarterlyKept.map(({ row }) => {
    const d = row.date instanceof Date ? row.date : new Date(row.date as string);
    const idx = indexOfFinQuarter(finQRows, row);
    if (idx < 0) {
      logYahooDividends(sym, "quarter row missing from finQRows by date key; using calendar DPS fallback", {
        key: rowDateKey(row),
      });
    }
    let fiscalPrev: Date | null = null;
    if (idx > 0) {
      const p = finQRows[idx - 1]?.date;
      if (p) fiscalPrev = p instanceof Date ? p : new Date(p as string);
    }
    const dps = pickQuarterlyDps(row, d, divEvents, fiscalPrev);
    return {
      date: d.toISOString().slice(0, 10),
      dividendPerShare: dps,
    };
  });

  const quartersWithPositiveDps = dividendQuarterly.filter(
    (p) => p.dividendPerShare != null && p.dividendPerShare > 0,
  ).length;

  logYahooDividends(sym, "dividend events merged", {
    historicalRows: fromHistorical.length,
    chartRows: fromChart.length,
    mergedUniqueExDates: divEvents.length,
    quarterlyRowsKept: quarterlyKept.length,
    quartersWithPositiveDps,
    sampleQuarterlyDps: dividendQuarterly.slice(-6),
    tailMergedExDates: divEvents.slice(-5),
  });

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

  const bsQList = (balanceSheetQuarterlyResult as BsRow[]).filter((r) => r?.date);
  const bsQByDate = new Map<string, BsRow>();
  for (const row of bsQList) {
    bsQByDate.set(rowDateKey(row), row);
  }

  const balanceSheetQuarterly: BalanceSheetQuarter[] = incomeQuarterly.map((inc) => {
    const key = inc.date.slice(0, 10);
    const exact = bsQByDate.get(key);
    if (exact) return mapBalanceQuarter(sym, exact);
    const nearest = nearestBsRowByDate(key, bsQList, NEAREST_BS_QUARTER_DAYS);
    if (nearest) return mapBalanceQuarter(sym, nearest);
    return emptyBalanceQuarter(sym, inc);
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

  const bundle: StockAnalysisBundle = {
    quote,
    income,
    cashFlow,
    balanceSheet,
    incomeQuarterly,
    cashFlowQuarterly,
    balanceSheetQuarterly,
    dividendQuarterly,
    historical,
    intraday,
    investor,
  };

  await enrichQuarterlyFromSecWhenDeep(sym, bundle);
  await applyGeminiFundamentalGaps(sym, bundle);

  return bundle;
}
