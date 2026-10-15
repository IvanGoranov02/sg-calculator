/**
 * When Gemini annual statements lag quarterly (e.g. annual stops at FY2024 but quarters include FY2025),
 * synthesize missing fiscal annual rows from four complete quarters, using an existing annual
 * statement's period end to identify the company's fiscal year and year-label convention.
 */

import { fiscalAnniversary, isCompleteQuarterlyPeriod, periodEndDate } from "@/lib/fiscalPeriods";
import { alignAnnualToIncome, dedupeQuarterlyIncome } from "@/lib/quarterlyAlign";
import {
  sortQuarterlyByDateAsc,
  type BalanceSheetAnnual,
  type BalanceSheetQuarter,
  type CashFlowAnnual,
  type IncomeStatementAnnual,
  type IncomeStatementQuarter,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

import { FUNDAMENTALS_HISTORY_YEARS } from "@/lib/fundamentalsHistoryLimits";

const MAX_ANNUAL_ROWS = FUNDAMENTALS_HISTORY_YEARS;

function sortAnnualByFy<T extends { fiscalYear: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
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
    capitalLeaseObligations: bs.capitalLeaseObligations ?? null,
  };
}

/**
 * Mutates `bundle`: appends missing fiscal years with four consecutive quarters, then trims
 * to the last {@link MAX_ANNUAL_ROWS} fiscal years. Without a real annual anchor, the fiscal
 * year is unknown and no annual totals are invented. The historical export name is retained.
 */
export function appendCalendarAnnualFromQuarterly(bundle: StockAnalysisBundle): void {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const existing = new Set(bundle.income.map((r) => r.fiscalYear));

  const anchor = [...bundle.income]
    .filter((r) => /^\d{4}$/.test(r.fiscalYear) && periodEndDate(r.date) != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1);
  if (!anchor) return;
  const anchorDate = periodEndDate(anchor.date)!;
  const allQuarters = sortQuarterlyByDateAsc(dedupeQuarterlyIncome(bundle.incomeQuarterly));
  const fiscalQuarters = new Map<string, IncomeStatementQuarter[]>();
  for (const q of allQuarters) {
    const end = periodEndDate(q.date);
    if (!end) continue;
    const candidates = [end.getUTCFullYear() - 1, end.getUTCFullYear(), end.getUTCFullYear() + 1];
    const endYear = candidates.find(
      (year) => Math.abs(end.getTime() - fiscalAnniversary(anchorDate, year).getTime()) <= 14 * 86_400_000,
    );
    if (endYear == null) continue;
    const fy = String(Number(anchor.fiscalYear) + endYear - anchorDate.getUTCFullYear());
    if (existing.has(fy)) continue;
    const start = fiscalAnniversary(anchorDate, endYear - 1).getTime();
    const quarters = allQuarters.filter((row) => {
      const date = periodEndDate(row.date)?.getTime();
      return date != null && date > start && date <= end.getTime();
    });
    if (isCompleteQuarterlyPeriod(quarters)) fiscalQuarters.set(fy, quarters);
  }

  const cfByDate = new Map(bundle.cashFlowQuarterly.map((r) => [r.date.slice(0, 10), r]));
  const bsByDate = new Map(bundle.balanceSheetQuarterly.map((r) => [r.date.slice(0, 10), r]));

  const syntheticIncome: IncomeStatementAnnual[] = [];
  const syntheticCf: CashFlowAnnual[] = [];
  const syntheticBs: BalanceSheetAnnual[] = [];

  for (const [fy, qs] of fiscalQuarters) {
    if (!qs.every((q) => [q.revenue, q.grossProfit, q.operatingExpenses, q.netIncome].every(Number.isFinite))) continue;

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

    // Annual diluted EPS ≈ sum of the four quarterly figures (standard for full-year EPS);
    // annual weighted-average shares ≈ mean of the quarterly weighted averages.
    let dilutedEps: number | undefined;
    if (qs.every((q) => q.dilutedEps != null && Number.isFinite(q.dilutedEps))) {
      dilutedEps = qs.reduce((s, q) => s + (q.dilutedEps as number), 0);
    }
    let dilutedAverageShares: number | undefined;
    const finiteShares = qs
      .map((q) => q.dilutedAverageShares)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (finiteShares.length === 4) {
      dilutedAverageShares = finiteShares.reduce((a, b) => a + b, 0) / finiteShares.length;
    }

    syntheticIncome.push({
      date: lastD,
      symbol: sym,
      fiscalYear: fy,
      revenue,
      grossProfit,
      operatingExpenses,
      netIncome,
      operatingIncome,
      ebitda,
      dilutedEps,
      dilutedAverageShares,
    });

    const cfs = qs.map((q) => cfByDate.get(q.date.slice(0, 10)));

    const ocf = sumIfAllFinite(cfs.map((c) => c?.operatingCashFlow));
    const capex = sumIfAllFinite(cfs.map((c) => c?.capitalExpenditure));
    let freeCashFlow = sumIfAllFinite(cfs.map((c) => c?.freeCashFlow));
    if (ocf != null && capex != null) {
      freeCashFlow = ocf + capex;
    }

    if (!bundle.cashFlow.some((row) => row.fiscalYear === fy)) syntheticCf.push({
      date: lastD,
      symbol: sym,
      fiscalYear: fy,
      freeCashFlow,
      operatingCashFlow: ocf,
      capitalExpenditure: capex,
      investingCashFlow: sumIfAllFinite(cfs.map((c) => c?.investingCashFlow)),
      financingCashFlow: sumIfAllFinite(cfs.map((c) => c?.financingCashFlow)),
      dividendsPaid: sumIfAllFinite(cfs.map((c) => c?.dividendsPaid)),
      stockRepurchase: sumIfAllFinite(cfs.map((c) => c?.stockRepurchase)),
    });

    const lastBs = bsByDate.get(lastD);
    if (!bundle.balanceSheet.some((row) => row.fiscalYear === fy)) syntheticBs.push(
      lastBs ? quarterBsToAnnual(lastBs, sym, fy) : stubAnnualBs(sym, lastD, fy),
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
