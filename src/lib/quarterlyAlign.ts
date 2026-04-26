import {
  sortQuarterlyByDateAsc,
  type BalanceSheetQuarter,
  type CashFlowQuarter,
  type DividendQuarterlyPoint,
  type IncomeStatementQuarter,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

export const NEAREST_QUARTER_SIDE_ROW_DAYS = 45;

function isoDay(d: string | Date): string | null {
  const dt = d instanceof Date ? d : new Date(`${String(d).slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function daysBetweenIso(a: string, b: string): number {
  const ta = new Date(`${a.slice(0, 10)}T12:00:00Z`).getTime();
  const tb = new Date(`${b.slice(0, 10)}T12:00:00Z`).getTime();
  return Math.abs(ta - tb) / 86400000;
}

export function nearestQuarterSideRow<T>(
  targetIso: string,
  rows: T[],
  rowDate: (row: T) => string | Date,
  maxDays = NEAREST_QUARTER_SIDE_ROW_DAYS,
): T | null {
  const target = isoDay(targetIso);
  if (!target) return null;
  let best: T | null = null;
  let bestDays = maxDays + 1;
  for (const row of rows) {
    const d = isoDay(rowDate(row));
    if (!d) continue;
    const days = daysBetweenIso(target, d);
    if (days < bestDays && days <= maxDays) {
      bestDays = days;
      best = row;
    }
  }
  return best;
}

function exactOrNearestSideRow<T extends { date: string }>(
  targetIso: string,
  byDate: Map<string, T>,
  rows: T[],
): T | null {
  const d = targetIso.slice(0, 10);
  return byDate.get(d) ?? nearestQuarterSideRow(d, rows, (r) => r.date);
}

/** Ensure cashFlow and balanceSheet have a row for every income fiscalYear. */
export function alignAnnualToIncome(
  sym: string,
  income: StockAnalysisBundle["income"],
  cf: StockAnalysisBundle["cashFlow"],
  bs: StockAnalysisBundle["balanceSheet"],
): Pick<StockAnalysisBundle, "cashFlow" | "balanceSheet"> {
  const cfBy = new Map(cf.map((r) => [r.fiscalYear, r]));
  const bsBy = new Map(bs.map((r) => [r.fiscalYear, r]));

  const cashFlow: StockAnalysisBundle["cashFlow"] = [];
  const balanceSheet: StockAnalysisBundle["balanceSheet"] = [];

  for (const inc of income) {
    const fy = inc.fiscalYear;
    cashFlow.push(
      cfBy.get(fy) ?? {
        date: inc.date,
        symbol: sym,
        fiscalYear: fy,
        freeCashFlow: 0,
        operatingCashFlow: null,
        capitalExpenditure: null,
        investingCashFlow: null,
        financingCashFlow: null,
        dividendsPaid: null,
        stockRepurchase: null,
      },
    );
    balanceSheet.push(
      bsBy.get(fy) ?? {
        date: inc.date,
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
      },
    );
  }

  return { cashFlow, balanceSheet };
}

export function stubCashFlowQuarter(sym: string, dateIso: string, netIncome: number): CashFlowQuarter {
  const ni = Number(netIncome);
  const fcf = Number.isFinite(ni) ? Math.max(0, ni * 0.85) : 0;
  return {
    date: dateIso,
    symbol: sym,
    freeCashFlow: fcf,
    operatingCashFlow: null,
    capitalExpenditure: null,
    investingCashFlow: null,
    financingCashFlow: null,
    dividendsPaid: null,
    stockRepurchase: null,
  };
}

export function stubBalanceQuarter(sym: string, dateIso: string): BalanceSheetQuarter {
  return {
    date: dateIso,
    symbol: sym,
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

/** Align CF/BS/dividend rows to `incomeSorted` dates (stubs when a side is missing). */
export function alignQuarterlyToIncome(
  sym: string,
  incomeSorted: IncomeStatementQuarter[],
  cfRaw: CashFlowQuarter[],
  bsRaw: BalanceSheetQuarter[],
  divRaw: DividendQuarterlyPoint[],
): Pick<StockAnalysisBundle, "cashFlowQuarterly" | "balanceSheetQuarterly" | "dividendQuarterly"> {
  const cfBy = new Map(cfRaw.map((r) => [r.date.slice(0, 10), r]));
  const bsBy = new Map(bsRaw.map((r) => [r.date.slice(0, 10), r]));
  const divBy = new Map(divRaw.map((r) => [r.date.slice(0, 10), r]));

  const cashFlowQuarterly: CashFlowQuarter[] = [];
  const balanceSheetQuarterly: BalanceSheetQuarter[] = [];
  const dividendQuarterly: DividendQuarterlyPoint[] = [];

  for (const inc of incomeSorted) {
    const d = inc.date.slice(0, 10);
    cashFlowQuarterly.push(exactOrNearestSideRow(d, cfBy, cfRaw) ?? stubCashFlowQuarter(sym, d, inc.netIncome));
    balanceSheetQuarterly.push(exactOrNearestSideRow(d, bsBy, bsRaw) ?? stubBalanceQuarter(sym, d));
    const dv = exactOrNearestSideRow(d, divBy, divRaw);
    dividendQuarterly.push(dv ?? { date: d, dividendPerShare: null });
  }

  return { cashFlowQuarterly, balanceSheetQuarterly, dividendQuarterly };
}

/** Keep the most recent `max` quarters (by period-end date). */
export function trimQuarterlyToMax<T extends { date: string }>(rows: T[], max: number): T[] {
  const sorted = sortQuarterlyByDateAsc(rows);
  if (sorted.length <= max) return sorted;
  return sorted.slice(-max);
}
