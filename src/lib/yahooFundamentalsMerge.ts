/**
 * After Gemini builds the bundle, fill null / zero gaps using Yahoo fundamentalsTimeSeries.
 * Server-only; does not replace Gemini rows — only patches missing fields.
 */

import YahooFinance from "yahoo-finance2";

import type {
  BalanceSheetAnnual,
  BalanceSheetQuarter,
  CashFlowAnnual,
  CashFlowQuarter,
  IncomeStatementAnnual,
  IncomeStatementQuarter,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pickNum(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Replace when null, or when 0 and Yahoo has a non-zero value (common Gemini placeholder). */
function mergeScalar(cur: number | null | undefined, yahoo: unknown): number {
  const y = pickNum(yahoo);
  const c = cur == null || (typeof cur === "number" && !Number.isFinite(cur)) ? null : cur;
  if (y == null) return c ?? 0;
  if (c == null) return y;
  if (c === 0 && y !== 0) return y;
  return c;
}

function mergeNullable(cur: number | null | undefined, yahoo: unknown): number | null {
  const y = pickNum(yahoo);
  if (y == null) return cur ?? null;
  if (cur == null) return y;
  if (cur === 0 && y !== 0) return y;
  return cur;
}

type Fin = {
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

type Cf = {
  date: Date;
  freeCashFlow?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  investingCashFlow?: number;
  financingCashFlow?: number;
  cashDividendsPaid?: number;
  commonStockRepurchased?: number;
};

type Bs = {
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

function indexAnnualByFiscalYear(rows: Fin[] | Cf[] | Bs[], fyFromRow: (r: { date: Date }) => string): Map<string, { date: Date }> {
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

export async function enrichBundleFundamentalsFromYahoo(bundle: StockAnalysisBundle): Promise<void> {
  const sym = bundle.quote.symbol.trim().toUpperCase();
  const period2 = new Date().toISOString().slice(0, 10);
  const period1 = "2014-01-01";

  let finA: Fin[];
  let finQ: Fin[];
  let cfA: Cf[];
  let cfQ: Cf[];
  let bsA: Bs[];
  let bsQ: Bs[];

  try {
    const [a1, a2, a3, a4, a5, a6] = await Promise.all([
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "annual", module: "financials" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "quarterly", module: "financials" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "annual", module: "cash-flow" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "quarterly", module: "cash-flow" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "annual", module: "balance-sheet" }),
      yahooFinance.fundamentalsTimeSeries(sym, { period1, period2, type: "quarterly", module: "balance-sheet" }),
    ]);
    finA = (a1 as Fin[]) ?? [];
    finQ = (a2 as Fin[]) ?? [];
    cfA = (a3 as Cf[]) ?? [];
    cfQ = (a4 as Cf[]) ?? [];
    bsA = (a5 as Bs[]) ?? [];
    bsQ = (a6 as Bs[]) ?? [];
  } catch {
    return;
  }

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
    return {
      ...row,
      symbol: symU,
      revenue: mergeScalar(row.revenue, fin.totalRevenue),
      grossProfit: mergeScalar(row.grossProfit, fin.grossProfit),
      operatingExpenses: mergeScalar(row.operatingExpenses, fin.operatingExpense),
      netIncome: mergeScalar(row.netIncome, fin.netIncome),
      operatingIncome: row.operatingIncome == null ? pickNum(fin.operatingIncome) ?? undefined : row.operatingIncome,
      ebitda: row.ebitda == null ? pickNum(fin.EBITDA) ?? undefined : row.ebitda,
      dilutedEps: row.dilutedEps == null ? pickNum(fin.dilutedEPS) ?? undefined : row.dilutedEps,
      dilutedAverageShares:
        row.dilutedAverageShares == null ? pickNum(fin.dilutedAverageShares) ?? undefined : row.dilutedAverageShares,
    };
  });

  bundle.cashFlow = bundle.cashFlow.map((row): CashFlowAnnual => {
    const cf = cfAByFy.get(row.fiscalYear) as Cf | undefined;
    if (!cf) return row;
    const ocf = mergeNullable(row.operatingCashFlow, cf.operatingCashFlow);
    const capex = mergeNullable(row.capitalExpenditure, cf.capitalExpenditure);
    let fcf = row.freeCashFlow;
    const filledOcfCapex =
      (row.operatingCashFlow == null && ocf != null) || (row.capitalExpenditure == null && capex != null);
    if (ocf != null && capex != null && (filledOcfCapex || row.freeCashFlow === 0)) {
      fcf = ocf + capex;
    } else {
      const yFcf = pickNum(cf.freeCashFlow);
      if (yFcf != null && (row.freeCashFlow === 0 || row.freeCashFlow == null)) fcf = yFcf;
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

  bundle.incomeQuarterly = bundle.incomeQuarterly.map((row): IncomeStatementQuarter => {
    const d = row.date.slice(0, 10);
    const fin = finQByDate.get(d) as Fin | undefined;
    if (!fin) return row;
    return {
      ...row,
      symbol: symU,
      revenue: mergeScalar(row.revenue, fin.totalRevenue),
      grossProfit: mergeScalar(row.grossProfit, fin.grossProfit),
      operatingExpenses: mergeScalar(row.operatingExpenses, fin.operatingExpense),
      netIncome: mergeScalar(row.netIncome, fin.netIncome),
      operatingIncome: row.operatingIncome == null ? pickNum(fin.operatingIncome) ?? undefined : row.operatingIncome,
      ebitda: row.ebitda == null ? pickNum(fin.EBITDA) ?? undefined : row.ebitda,
      dilutedEps: row.dilutedEps == null ? pickNum(fin.dilutedEPS) ?? undefined : row.dilutedEps,
      dilutedAverageShares:
        row.dilutedAverageShares == null ? pickNum(fin.dilutedAverageShares) ?? undefined : row.dilutedAverageShares,
    };
  });

  bundle.cashFlowQuarterly = bundle.cashFlowQuarterly.map((row): CashFlowQuarter => {
    const d = row.date.slice(0, 10);
    const cf = cfQByDate.get(d) as Cf | undefined;
    if (!cf) return row;
    const ocf = mergeNullable(row.operatingCashFlow, cf.operatingCashFlow);
    const capex = mergeNullable(row.capitalExpenditure, cf.capitalExpenditure);
    let fcf = row.freeCashFlow;
    const filledOcfCapex =
      (row.operatingCashFlow == null && ocf != null) || (row.capitalExpenditure == null && capex != null);
    if (ocf != null && capex != null && (filledOcfCapex || row.freeCashFlow === 0)) {
      fcf = ocf + capex;
    } else {
      const yFcf = pickNum(cf.freeCashFlow);
      if (yFcf != null && (row.freeCashFlow === 0 || row.freeCashFlow == null)) fcf = yFcf;
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
    const bs = bsQByDate.get(d) as Bs | undefined;
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
    const fin = finQByDate.get(p.date.slice(0, 10)) as Fin | undefined;
    if (!fin) return p;
    const dps = pickNum(fin.dividendPerShare);
    if (dps == null) return p;
    if (p.dividendPerShare != null && p.dividendPerShare !== 0) return p;
    return { ...p, dividendPerShare: dps };
  });
}
