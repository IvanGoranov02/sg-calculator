/** Shared shapes for stock analysis UI (Yahoo Finance via yahoo-finance2). */

export type StockQuote = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
};

export type IncomeStatementAnnual = {
  date: string;
  symbol: string;
  fiscalYear: string;
  revenue: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
};

export type CashFlowAnnual = {
  date: string;
  symbol: string;
  fiscalYear: string;
  freeCashFlow: number;
};

export type HistoricalEodBar = {
  /** ISO date (daily) or datetime (intraday) */
  date: string;
  close: number;
  high?: number;
  low?: number;
  volume?: number;
};

/** Price chart range (1D uses intraday when available). */
export type PerformanceRange = "1d" | "1w" | "1m" | "1y" | "5y" | "max";

export type ChartMetric = "price" | "revenue" | "netIncome" | "freeCashFlow";

export type StockAnalysisBundle = {
  quote: StockQuote;
  income: IncomeStatementAnnual[];
  cashFlow: CashFlowAnnual[];
  /** Daily OHLCV, long history for range selector */
  historical: HistoricalEodBar[];
  /** 5m bars (recent sessions) for 1D view; optional if fetch fails */
  intraday?: HistoricalEodBar[];
};

export type IncomeMetricKey = "revenue" | "grossProfit" | "operatingExpenses" | "netIncome";

export const incomeStatementMetricKeys: IncomeMetricKey[] = [
  "revenue",
  "grossProfit",
  "operatingExpenses",
  "netIncome",
];

export type IncomeTableRow = {
  label: string;
  key: IncomeMetricKey;
};

export const incomeTableRows: IncomeTableRow[] = [
  { label: "Revenue", key: "revenue" },
  { label: "Gross profit", key: "grossProfit" },
  { label: "Operating expenses", key: "operatingExpenses" },
  { label: "Net income", key: "netIncome" },
];

export function sortIncomeByYearAsc(rows: IncomeStatementAnnual[]): IncomeStatementAnnual[] {
  return [...rows].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
}
