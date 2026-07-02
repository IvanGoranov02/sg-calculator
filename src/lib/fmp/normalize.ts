/**
 * Financial Modeling Prep statements → StockAnalysisBundle fundamentals.
 *
 * FMP serves professionally normalized statements built from official SEC
 * filings — the same underlying data as EDGAR, but already reconciled (tags,
 * fiscal periods, Q4 values, EPS incl. multi-class filers, total/net debt),
 * which removes the whole class of extraction bugs we kept hitting with raw
 * XBRL. The mapper is tolerant to both the legacy /api/v3 and the newer
 * /stable field names.
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
import { sortIncomeByYearAsc, sortQuarterlyByDateAsc } from "@/lib/stockAnalysisTypes";
import { emptyInvestorMetrics } from "@/lib/edgar/normalize";

export type FmpStatements = {
  incomeAnnual: unknown[];
  incomeQuarter: unknown[];
  balanceAnnual: unknown[];
  balanceQuarter: unknown[];
  cashFlowAnnual: unknown[];
  cashFlowQuarter: unknown[];
};

type Rec = Record<string, unknown>;

function num(r: Rec, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = r[k];
    if (v == null) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function isoDate(r: Rec): string | null {
  const s = String(r.date ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Same convention as the EDGAR path: fiscal year labeled by the period-end year. */
function fyOf(date: string): string {
  return date.slice(0, 4);
}

/** Cash outflows stored negative (matches Yahoo/EDGAR convention), null preserved. */
function outflow(v: number | null): number | null {
  return v == null ? null : -Math.abs(v);
}

function mapIncome(r: Rec): Omit<IncomeStatementQuarter, "date" | "symbol"> | null {
  const revenue = num(r, "revenue");
  const netIncome = num(r, "netIncome", "bottomLineNetIncome");
  if (revenue == null && netIncome == null) return null;
  return {
    revenue: revenue ?? 0,
    grossProfit: num(r, "grossProfit") ?? 0,
    operatingExpenses: num(r, "operatingExpenses") ?? 0,
    netIncome: netIncome ?? 0,
    operatingIncome: num(r, "operatingIncome") ?? undefined,
    ebitda: num(r, "ebitda") ?? undefined,
    dilutedEps: num(r, "epsDiluted", "epsdiluted", "eps") ?? undefined,
    dilutedAverageShares:
      num(r, "weightedAverageShsOutDil", "weightedAverageShsOut") ?? undefined,
  };
}

function mapCashFlow(r: Rec): Omit<CashFlowQuarter, "date" | "symbol"> {
  const ocf = num(r, "operatingCashFlow", "netCashProvidedByOperatingActivities");
  const capex = outflow(num(r, "capitalExpenditure"));
  const fcfGiven = num(r, "freeCashFlow");
  return {
    freeCashFlow: fcfGiven ?? (ocf != null && capex != null ? ocf + capex : (ocf ?? 0)),
    operatingCashFlow: ocf,
    capitalExpenditure: capex,
    investingCashFlow: num(
      r,
      "netCashProvidedByInvestingActivities",
      "netCashUsedForInvestingActivites",
      "netCashUsedForInvestingActivities",
    ),
    financingCashFlow: num(
      r,
      "netCashProvidedByFinancingActivities",
      "netCashUsedProvidedByFinancingActivities",
    ),
    dividendsPaid: outflow(num(r, "netDividendsPaid", "dividendsPaid", "commonDividendsPaid")),
    stockRepurchase: outflow(num(r, "commonStockRepurchased")),
  };
}

function mapBalance(r: Rec): Omit<BalanceSheetQuarter, "date" | "symbol"> {
  return {
    totalAssets: num(r, "totalAssets"),
    totalDebt: num(r, "totalDebt"),
    netDebt: num(r, "netDebt"),
    stockholdersEquity: num(r, "totalStockholdersEquity", "totalEquity"),
    cashAndCashEquivalents: num(r, "cashAndCashEquivalents"),
    totalCurrentAssets: num(r, "totalCurrentAssets"),
    totalCurrentLiabilities: num(r, "totalCurrentLiabilities"),
    inventory: num(r, "inventory"),
    accountsReceivable: num(r, "netReceivables", "accountsReceivables"),
    goodwill: num(r, "goodwill"),
    longTermDebt: num(r, "longTermDebt"),
  };
}

function recs(arr: unknown[]): { date: string; rec: Rec }[] {
  const out: { date: string; rec: Rec }[] = [];
  const seen = new Set<string>();
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Rec;
    const date = isoDate(rec);
    if (!date || seen.has(date)) continue;
    seen.add(date);
    out.push({ date, rec });
  }
  return out;
}

/** Reported currency of the most recent annual income row, or "USD". */
export function detectFmpCurrency(statements: FmpStatements): string {
  for (const { rec } of recs(statements.incomeAnnual)) {
    const c = rec.reportedCurrency;
    if (typeof c === "string" && /^[A-Z]{3}$/.test(c)) return c;
  }
  return "USD";
}

/**
 * Build the fundamentals part of a bundle from FMP statements. Returns null when
 * the data is too thin (caller then falls back to EDGAR/Gemini).
 */
export function bundleFromFmpStatements(
  symbol: string,
  statements: FmpStatements,
): StockAnalysisBundle | null {
  const sym = symbol.trim().toUpperCase();

  const income: IncomeStatementAnnual[] = [];
  for (const { date, rec } of recs(statements.incomeAnnual)) {
    const m = mapIncome(rec);
    if (!m) continue;
    income.push({ date, symbol: sym, fiscalYear: fyOf(date), ...m });
  }
  const usable = income.filter((r) => r.revenue !== 0 || r.netIncome !== 0);
  // One filed annual is enough (recent IPOs) — far better than the Gemini fallback.
  if (usable.length < 1) return null;

  const cashFlow: CashFlowAnnual[] = recs(statements.cashFlowAnnual).map(({ date, rec }) => ({
    date,
    symbol: sym,
    fiscalYear: fyOf(date),
    ...mapCashFlow(rec),
  }));

  const balanceSheet: BalanceSheetAnnual[] = recs(statements.balanceAnnual).map(({ date, rec }) => ({
    date,
    symbol: sym,
    fiscalYear: fyOf(date),
    ...mapBalance(rec),
  }));

  const incomeQuarterly: IncomeStatementQuarter[] = [];
  for (const { date, rec } of recs(statements.incomeQuarter)) {
    const m = mapIncome(rec);
    if (!m) continue;
    incomeQuarterly.push({ date, symbol: sym, ...m });
  }

  const cashFlowQuarterly: CashFlowQuarter[] = recs(statements.cashFlowQuarter).map(
    ({ date, rec }) => ({ date, symbol: sym, ...mapCashFlow(rec) }),
  );

  const balanceSheetQuarterly: BalanceSheetQuarter[] = recs(statements.balanceQuarter).map(
    ({ date, rec }) => ({ date, symbol: sym, ...mapBalance(rec) }),
  );

  const sortedQuarters = sortQuarterlyByDateAsc(incomeQuarterly);

  return {
    quote: { symbol: sym, name: sym, price: 0, change: 0, changesPercentage: 0 },
    income: sortIncomeByYearAsc(income),
    cashFlow: [...cashFlow].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear)),
    balanceSheet: [...balanceSheet].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear)),
    historical: [],
    investor: emptyInvestorMetrics(detectFmpCurrency(statements)),
    incomeQuarterly: sortedQuarters,
    cashFlowQuarterly: sortQuarterlyByDateAsc(cashFlowQuarterly),
    balanceSheetQuarterly: sortQuarterlyByDateAsc(balanceSheetQuarterly),
    dividendQuarterly: sortedQuarters.map((q) => ({ date: q.date, dividendPerShare: null })),
  };
}
