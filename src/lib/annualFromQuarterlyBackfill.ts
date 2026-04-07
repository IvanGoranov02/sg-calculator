/**
 * When Gemini annual statements lag quarterly (e.g. annual stops at FY2024 but quarters include FY2025),
 * synthesize missing **calendar-year** annual rows by summing four quarters. Fits calendar fiscal years
 * (e.g. ASML); may mis-aggregate for off-calendar fiscal years if quarters split oddly across calendar years.
 */

import { alignAnnualToIncome } from "@/lib/quarterlyAlign";
import {
  sortQuarterlyByDateAsc,
  type BalanceSheetAnnual,
  type BalanceSheetQuarter,
  type CashFlowAnnual,
  type IncomeStatementAnnual,
  type IncomeStatementQuarter,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

const MAX_ANNUAL_ROWS = 10;

function sortAnnualByFy<T extends { fiscalYear: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
}

function utcYearFromIso(iso: string): number {
  return new Date(iso.slice(0, 10) + "T12:00:00Z").getUTCFullYear();
}

function sumIfAllFinite(values: (number | null | undefined)[]): number | null {
  const nums: number[] = [];
  for (const v of values) {
    if (typeof v !== "number" || !Number.isFinite(v)) return null;
    nums.push(v);
  }
  return nums.reduce((a, b) => a + b, 0);
}

function stubAnnualBs(sym: string, date: string, fy: string): BalanceSheetAnnual {
  return {
    date,
    symbol: sym,
    fiscalYear: fy,
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

function quarterBsToAnnual(bs: BalanceSheetQuarter, sym: string, fy: string): BalanceSheetAnnual {
  const d = bs.date.slice(0, 10);
  return {
    date: d,
    symbol: sym,
    fiscalYear: fy,
    totalAssets: bs.totalAssets,
    totalDebt: bs.totalDebt,
    netDebt: bs.netDebt,
    stockholdersEquity: bs.stockholdersEquity,
    cashAndCashEquivalents: bs.cashAndCashEquivalents,
    totalCurrentAssets: bs.totalCurrentAssets,
    totalCurrentLiabilities: bs.totalCurrentLiabilities,
    inventory: bs.inventory,
    accountsReceivable: bs.accountsReceivable,
    goodwill: bs.goodwill,
    longTermDebt: bs.longTermDebt,
  };
}

/**
 * Mutates `bundle`: appends annual rows for calendar years that have 4 quarterly income rows
 * but no matching `fiscalYear`, then trims to the last {@link MAX_ANNUAL_ROWS} fiscal years.
 */
export function appendCalendarAnnualFromQuarterly(bundle: StockAnalysisBundle): void {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const existing = new Set(bundle.income.map((r) => r.fiscalYear));

  const incByYear = new Map<number, IncomeStatementQuarter[]>();
  for (const q of bundle.incomeQuarterly) {
    const y = utcYearFromIso(q.date);
    const arr = incByYear.get(y);
    if (arr) arr.push(q);
    else incByYear.set(y, [q]);
  }

  const cfByDate = new Map(bundle.cashFlowQuarterly.map((r) => [r.date.slice(0, 10), r]));
  const bsByDate = new Map(bundle.balanceSheetQuarterly.map((r) => [r.date.slice(0, 10), r]));

  const syntheticIncome: IncomeStatementAnnual[] = [];
  const syntheticCf: CashFlowAnnual[] = [];
  const syntheticBs: BalanceSheetAnnual[] = [];

  const years = [...incByYear.keys()].sort((a, b) => a - b);
  for (const y of years) {
    if (existing.has(String(y))) continue;
    const raw = incByYear.get(y);
    if (!raw) continue;
    const qs = sortQuarterlyByDateAsc(raw);
    if (qs.length < 4) continue;

    const lastD = qs[qs.length - 1]!.date.slice(0, 10);

    const revenue = qs.reduce((s, q) => s + q.revenue, 0);
    const grossProfit = qs.reduce((s, q) => s + q.grossProfit, 0);
    const operatingExpenses = qs.reduce((s, q) => s + q.operatingExpenses, 0);
    const netIncome = qs.reduce((s, q) => s + q.netIncome, 0);

    let operatingIncome: number | undefined;
    if (qs.every((q) => q.operatingIncome != null && Number.isFinite(q.operatingIncome))) {
      operatingIncome = qs.reduce((s, q) => s + (q.operatingIncome as number), 0);
    }
    let ebitda: number | undefined;
    if (qs.every((q) => q.ebitda != null && Number.isFinite(q.ebitda))) {
      ebitda = qs.reduce((s, q) => s + (q.ebitda as number), 0);
    }

    syntheticIncome.push({
      date: lastD,
      symbol: sym,
      fiscalYear: String(y),
      revenue,
      grossProfit,
      operatingExpenses,
      netIncome,
      operatingIncome,
      ebitda,
    });

    const cfs = qs.map((q) => cfByDate.get(q.date.slice(0, 10)));

    const ocf = sumIfAllFinite(cfs.map((c) => c?.operatingCashFlow));
    const capex = sumIfAllFinite(cfs.map((c) => c?.capitalExpenditure));
    const fcfSum = cfs.reduce(
      (s, c) => s + (c && Number.isFinite(c.freeCashFlow) ? c.freeCashFlow : 0),
      0,
    );
    let freeCashFlow = fcfSum;
    if (ocf != null && capex != null) {
      freeCashFlow = ocf + capex;
    }

    syntheticCf.push({
      date: lastD,
      symbol: sym,
      fiscalYear: String(y),
      freeCashFlow,
      operatingCashFlow: ocf,
      capitalExpenditure: capex,
      investingCashFlow: sumIfAllFinite(cfs.map((c) => c?.investingCashFlow)),
      financingCashFlow: sumIfAllFinite(cfs.map((c) => c?.financingCashFlow)),
      dividendsPaid: sumIfAllFinite(cfs.map((c) => c?.dividendsPaid)),
      stockRepurchase: sumIfAllFinite(cfs.map((c) => c?.stockRepurchase)),
    });

    const lastBs = bsByDate.get(lastD);
    syntheticBs.push(
      lastBs ? quarterBsToAnnual(lastBs, sym, String(y)) : stubAnnualBs(sym, lastD, String(y)),
    );
  }

  if (syntheticIncome.length === 0) return;

  const mergedIncome = sortAnnualByFy([...bundle.income, ...syntheticIncome]);
  const mergedCf = sortAnnualByFy([...bundle.cashFlow, ...syntheticCf]);
  const mergedBs = sortAnnualByFy([...bundle.balanceSheet, ...syntheticBs]);

  const tailIncome =
    mergedIncome.length <= MAX_ANNUAL_ROWS ? mergedIncome : mergedIncome.slice(-MAX_ANNUAL_ROWS);
  const fyKeep = new Set(tailIncome.map((r) => r.fiscalYear));
  const tailCf = mergedCf.filter((r) => fyKeep.has(r.fiscalYear));
  const tailBs = mergedBs.filter((r) => fyKeep.has(r.fiscalYear));

  const aligned = alignAnnualToIncome(sym, tailIncome, tailCf, tailBs);
  bundle.income = tailIncome;
  bundle.cashFlow = aligned.cashFlow;
  bundle.balanceSheet = aligned.balanceSheet;
}
