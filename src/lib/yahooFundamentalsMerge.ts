/**
 * Yahoo fundamentalsTimeSeries: fetch 5y window, merge into bundle with Yahoo taking priority over Gemini.
 */

import YahooFinance from "yahoo-finance2";

import {
  FUNDAMENTALS_MAX_QUARTERS,
  fundamentalsPeriod1Iso,
} from "@/lib/fundamentalsHistoryLimits";
import { alignQuarterlyToIncome, nearestQuarterSideRow, trimQuarterlyToMax } from "@/lib/quarterlyAlign";
import {
  sortQuarterlyByDateAsc,
  type BalanceSheetAnnual,
  type BalanceSheetQuarter,
  type CashFlowAnnual,
  type CashFlowQuarter,
  type IncomeStatementAnnual,
  type IncomeStatementQuarter,
  type StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export type Fin = {
  date: Date;
  totalRevenue?: number;
  grossProfit?: number;
  operatingExpense?: number;
  netIncome?: number;
  operatingIncome?: number;
  EBITDA?: number;
  dilutedEPS?: number;
  dilutedAverageShares?: number;
  dividendPerShare?: number;
};

export type Cf = {
  date: Date;
  freeCashFlow?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  cashDividendsPaid?: number;
  commonStockRepurchased?: number;
};

export type Bs = {
  date: Date;
  totalAssets?: number;
  totalDebt?: number;
  netDebt?: number;
  stockholdersEquity?: number;
  cashAndCashEquivalents?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  accountsReceivable?: number;
  goodwill?: number;
  longTermDebt?: number;
};

export type YahooFundamentalsPayload = {
  finA: Fin[];
  finQ: Fin[];
  cfA: Cf[];
  cfQ: Cf[];
  bsA: Bs[];
  bsQ: Bs[];
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

import { mergeNullablePreferYahoo, mergeScalarPreferYahoo, pickNum } from "@/lib/yahooMergePolicy";

const mergeScalar = mergeScalarPreferYahoo;
const mergeNullable = mergeNullablePreferYahoo;

function indexByDate<T extends { date: Date }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) {
    if (!r?.date) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    if (Number.isNaN(d.getTime())) continue;
    m.set(iso(d), r);
  }
  return m;
}

function exactOrNearestYahooQuarter<T extends { date: Date }>(
  dateIso: string,
  byDate: Map<string, T>,
  rows: T[],
): T | null {
  const d = dateIso.slice(0, 10);
  return byDate.get(d) ?? nearestQuarterSideRow(d, rows, (r) => r.date);
}

function indexAnnualByFiscalYear(
  rows: Fin[] | Cf[] | Bs[],
  fyFromRow: (r: { date: Date }) => string,
): Map<string, { date: Date }> {
  const m = new Map<string, { date: Date }>();
  for (const r of rows) {
    if (!r?.date) continue;
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    if (Number.isNaN(d.getTime())) continue;
    const fy = fyFromRow({ date: d });
    m.set(fy, r);
  }
  return m;
}

function filterRowsSincePeriod1<T extends { date: Date }>(rows: T[], period1: string): T[] {
  return rows.filter((r) => {
    if (!r?.date) return false;
    const d = r.date instanceof Date ? r.date : new Date(r.date as string);
    if (Number.isNaN(d.getTime())) return false;
    return iso(d) >= period1;
  });
}

export async function fetchYahooFundamentalsPayload(symbol: string): Promise<YahooFundamentalsPayload | null> {
  const sym = symbol.trim().toUpperCase();
  const period2 = new Date().toISOString().slice(0, 10);
  const period1 = fundamentalsPeriod1Iso();

  try {
    const [a1, a2, a3, a4, a5, a6] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "annual", module: "financials" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "quarterly", module: "financials" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "annual", module: "cash-flow" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "quarterly", module: "cash-flow" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "annual", module: "balance-sheet" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "quarterly", module: "balance-sheet" }),
    ]);

    return {
      finA: filterRowsSincePeriod1((a1 as Fin[]) ?? [], period1),
      finQ: filterRowsSincePeriod1((a2 as Fin[]) ?? [], period1),
      cfA: filterRowsSincePeriod1((a3 as Cf[]) ?? [], period1),
      cfQ: filterRowsSincePeriod1((a4 as Cf[]) ?? [], period1),
      bsA: filterRowsSincePeriod1((a5 as Bs[]) ?? [], period1),
      bsQ: filterRowsSincePeriod1((a6 as Bs[]) ?? [], period1),
    };
  } catch {
    return null;
  }
}

export function applyYahooFundamentalsToBundle(
  bundle: StockAnalysisBundle,
  payload: YahooFundamentalsPayload,
): void {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const { finA, finQ, cfA, cfQ, bsA, bsQ } = payload;

  const finAByFy = indexAnnualByFiscalYear(finA, ({ date }) => String(date.getUTCFullYear()));
  const cfAByFy = indexAnnualByFiscalYear(cfA, ({ date }) => String(date.getUTCFullYear()));
  const bsAByFy = indexAnnualByFiscalYear(bsA, ({ date }) => String(date.getUTCFullYear()));

  const finQByDate = indexByDate(finQ);
  const cfQByDate = indexByDate(cfQ);
  const bsQByDate = indexByDate(bsQ);

  const symU = sym;

  bundle.income = bundle.income.map((row): IncomeStatementAnnual => {
    const fin = finAByFy.get(row.fiscalYear) as Fin | undefined;
    if (!fin) return row;
    const yOi = pickNum(fin.operatingIncome);
    const yEbitda = pickNum(fin.EBITDA);
    const yEps = pickNum(fin.dilutedEPS);
    const yShares = pickNum(fin.dilutedAverageShares);
    return {
      ...row,
      symbol: symU,
      revenue: mergeScalar(row.revenue, fin.totalRevenue),
      grossProfit: mergeScalar(row.grossProfit, fin.grossProfit),
      operatingExpenses: mergeScalar(row.operatingExpenses, fin.operatingExpense),
      netIncome: mergeScalar(row.netIncome, fin.netIncome),
      operatingIncome: yOi ?? row.operatingIncome,
      ebitda: yEbitda ?? row.ebitda,
      dilutedEps: yEps ?? row.dilutedEps,
      dilutedAverageShares: yShares ?? row.dilutedAverageShares,
    };
  });

  bundle.cashFlow = bundle.cashFlow.map((row): CashFlowAnnual => {
    const cf = cfAByFy.get(row.fiscalYear) as Cf | undefined;
    if (!cf) return row;
    const ocf = mergeNullable(row.operatingCashFlow, cf.operatingCashFlow);
    const capex = mergeNullable(row.capitalExpenditure, cf.capitalExpenditure);
    let fcf = row.freeCashFlow;
    const yFcf = pickNum(cf.freeCashFlow);
    if (yFcf != null) {
      fcf = yFcf;
    } else if (ocf != null && capex != null) {
      fcf = ocf + capex;
    }
    return {
      ...row,
      symbol: symU,
      freeCashFlow: fcf,
      operatingCashFlow: ocf,
      capitalExpenditure: capex,
      investingCashFlow: mergeNullable(row.investingCashFlow, cf.investingCashFlow),
      financingCashFlow: mergeNullable(row.financingCashFlow, cf.financingCashFlow),
      dividendsPaid: mergeNullable(row.dividendsPaid, cf.cashDividendsPaid),
      stockRepurchase: mergeNullable(row.stockRepurchase, cf.commonStockRepurchased),
    };
  });

  bundle.balanceSheet = bundle.balanceSheet.map((row): BalanceSheetAnnual => {
    const bs = bsAByFy.get(row.fiscalYear) as Bs | undefined;
    if (!bs) return row;
    return {
      ...row,
      symbol: symU,
      totalAssets: mergeNullable(row.totalAssets, bs.totalAssets),
      totalDebt: mergeNullable(row.totalDebt, bs.totalDebt),
      netDebt: mergeNullable(row.netDebt, bs.netDebt),
      stockholdersEquity: mergeNullable(row.stockholdersEquity, bs.stockholdersEquity),
      cashAndCashEquivalents: mergeNullable(row.cashAndCashEquivalents, bs.cashAndCashEquivalents),
      totalCurrentAssets: mergeNullable(row.totalCurrentAssets, bs.currentAssets),
      totalCurrentLiabilities: mergeNullable(row.totalCurrentLiabilities, bs.currentLiabilities),
      inventory: mergeNullable(row.inventory, bs.inventory),
      accountsReceivable: mergeNullable(row.accountsReceivable, bs.accountsReceivable),
      goodwill: mergeNullable(row.goodwill, bs.goodwill),
      longTermDebt: mergeNullable(row.longTermDebt, bs.longTermDebt),
    };
  });

  const quarterEndsSeen = new Set(bundle.incomeQuarterly.map((r) => r.date.slice(0, 10)));
  const yahooOnlyQuarters: IncomeStatementQuarter[] = [];
  for (const fin of finQ) {
    const d = iso(fin.date);
    if (quarterEndsSeen.has(d)) continue;
    const rev = pickNum(fin.totalRevenue);
    const gp = pickNum(fin.grossProfit);
    const ni = pickNum(fin.netIncome);
    const oi = pickNum(fin.operatingIncome);
    if (rev == null && gp == null && ni == null && oi == null) continue;
    yahooOnlyQuarters.push({
      date: d,
      symbol: symU,
      revenue: rev ?? 0,
      grossProfit: gp ?? 0,
      operatingExpenses: pickNum(fin.operatingExpense) ?? 0,
      netIncome: ni ?? 0,
      operatingIncome: oi ?? undefined,
      ebitda: pickNum(fin.EBITDA) ?? undefined,
      dilutedEps: pickNum(fin.dilutedEPS) ?? undefined,
      dilutedAverageShares: pickNum(fin.dilutedAverageShares) ?? undefined,
    });
    quarterEndsSeen.add(d);
  }

  if (yahooOnlyQuarters.length > 0) {
    bundle.incomeQuarterly = trimQuarterlyToMax(
      sortQuarterlyByDateAsc([...bundle.incomeQuarterly, ...yahooOnlyQuarters]),
      FUNDAMENTALS_MAX_QUARTERS,
    );
    const aligned = alignQuarterlyToIncome(
      symU,
      bundle.incomeQuarterly,
      bundle.cashFlowQuarterly,
      bundle.balanceSheetQuarterly,
      bundle.dividendQuarterly,
    );
    bundle.cashFlowQuarterly = aligned.cashFlowQuarterly;
    bundle.balanceSheetQuarterly = aligned.balanceSheetQuarterly;
    bundle.dividendQuarterly = aligned.dividendQuarterly;
  } else {
    bundle.incomeQuarterly = sortQuarterlyByDateAsc(bundle.incomeQuarterly);
  }

  bundle.incomeQuarterly = bundle.incomeQuarterly.map((row): IncomeStatementQuarter => {
    const d = row.date.slice(0, 10);
    const fin = exactOrNearestYahooQuarter(d, finQByDate, finQ) as Fin | null;
    if (!fin) return row;
    const yOi = pickNum(fin.operatingIncome);
    const yEbitda = pickNum(fin.EBITDA);
    const yEps = pickNum(fin.dilutedEPS);
    const yShares = pickNum(fin.dilutedAverageShares);
    return {
      ...row,
      symbol: symU,
      revenue: mergeScalar(row.revenue, fin.totalRevenue),
      grossProfit: mergeScalar(row.grossProfit, fin.grossProfit),
      operatingExpenses: mergeScalar(row.operatingExpenses, fin.operatingExpense),
      netIncome: mergeScalar(row.netIncome, fin.netIncome),
      operatingIncome: yOi ?? row.operatingIncome,
      ebitda: yEbitda ?? row.ebitda,
      dilutedEps: yEps ?? row.dilutedEps,
      dilutedAverageShares: yShares ?? row.dilutedAverageShares,
    };
  });

  bundle.cashFlowQuarterly = bundle.cashFlowQuarterly.map((row): CashFlowQuarter => {
    const d = row.date.slice(0, 10);
    const cf = exactOrNearestYahooQuarter(d, cfQByDate, cfQ) as Cf | null;
    if (!cf) return row;
    const ocf = mergeNullable(row.operatingCashFlow, cf.operatingCashFlow);
    const capex = mergeNullable(row.capitalExpenditure, cf.capitalExpenditure);
    let fcf = row.freeCashFlow;
    const yFcf = pickNum(cf.freeCashFlow);
    if (yFcf != null) {
      fcf = yFcf;
    } else if (ocf != null && capex != null) {
      fcf = ocf + capex;
    }
    return {
      ...row,
      symbol: symU,
      freeCashFlow: fcf,
      operatingCashFlow: ocf,
      capitalExpenditure: capex,
      investingCashFlow: mergeNullable(row.investingCashFlow, cf.investingCashFlow),
      financingCashFlow: mergeNullable(row.financingCashFlow, cf.financingCashFlow),
      dividendsPaid: mergeNullable(row.dividendsPaid, cf.cashDividendsPaid),
      stockRepurchase: mergeNullable(row.stockRepurchase, cf.commonStockRepurchased),
    };
  });

  bundle.balanceSheetQuarterly = bundle.balanceSheetQuarterly.map((row): BalanceSheetQuarter => {
    const d = row.date.slice(0, 10);
    const bs = exactOrNearestYahooQuarter(d, bsQByDate, bsQ) as Bs | null;
    if (!bs) return row;
    return {
      ...row,
      symbol: symU,
      totalAssets: mergeNullable(row.totalAssets, bs.totalAssets),
      totalDebt: mergeNullable(row.totalDebt, bs.totalDebt),
      netDebt: mergeNullable(row.netDebt, bs.netDebt),
      stockholdersEquity: mergeNullable(row.stockholdersEquity, bs.stockholdersEquity),
      cashAndCashEquivalents: mergeNullable(row.cashAndCashEquivalents, bs.cashAndCashEquivalents),
      totalCurrentAssets: mergeNullable(row.totalCurrentAssets, bs.currentAssets),
      totalCurrentLiabilities: mergeNullable(row.totalCurrentLiabilities, bs.currentLiabilities),
      inventory: mergeNullable(row.inventory, bs.inventory),
      accountsReceivable: mergeNullable(row.accountsReceivable, bs.accountsReceivable),
      goodwill: mergeNullable(row.goodwill, bs.goodwill),
      longTermDebt: mergeNullable(row.longTermDebt, bs.longTermDebt),
    };
  });

  bundle.dividendQuarterly = bundle.dividendQuarterly.map((p) => {
    const fin = exactOrNearestYahooQuarter(p.date.slice(0, 10), finQByDate, finQ) as Fin | null;
    if (!fin) return p;
    const dps = pickNum(fin.dividendPerShare);
    if (dps == null) return p;
    return { ...p, dividendPerShare: dps };
  });
}

export async function enrichBundleFundamentalsFromYahoo(bundle: StockAnalysisBundle): Promise<void> {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const payload = await fetchYahooFundamentalsPayload(sym);
  if (payload) applyYahooFundamentalsToBundle(bundle, payload);
}
