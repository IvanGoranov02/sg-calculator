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
  /** Operating income when Yahoo reports it (for margins). */
  operatingIncome?: number;
  /** EBITDA when Yahoo reports it. */
  ebitda?: number;
};

export type BalanceSheetAnnual = {
  date: string;
  symbol: string;
  fiscalYear: string;
  totalAssets: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  stockholdersEquity: number | null;
  cashAndCashEquivalents: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  inventory: number | null;
  accountsReceivable: number | null;
  goodwill: number | null;
  longTermDebt: number | null;
};

export type CashFlowAnnual = {
  date: string;
  symbol: string;
  fiscalYear: string;
  freeCashFlow: number;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  dividendsPaid: number | null;
  stockRepurchase: number | null;
};

/** Quarterly income statement (period end date ISO; label formatted in UI). */
export type IncomeStatementQuarter = {
  date: string;
  symbol: string;
  revenue: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  operatingIncome?: number;
  ebitda?: number;
};

export type BalanceSheetQuarter = {
  date: string;
  symbol: string;
  totalAssets: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  stockholdersEquity: number | null;
  cashAndCashEquivalents: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  inventory: number | null;
  accountsReceivable: number | null;
  goodwill: number | null;
  longTermDebt: number | null;
};

export type CashFlowQuarter = {
  date: string;
  symbol: string;
  freeCashFlow: number;
  operatingCashFlow: number | null;
  capitalExpenditure: number | null;
  investingCashFlow: number | null;
  financingCashFlow: number | null;
  dividendsPaid: number | null;
  stockRepurchase: number | null;
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

/** Yahoo quoteSummary–derived fields for investor-facing tables (mostly TTM / snapshot). */
export type InvestorMetrics = {
  currency: string;
  marketCap: number | null;
  enterpriseValue: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToSales: number | null;
  priceToBook: number | null;
  enterpriseToRevenue: number | null;
  enterpriseToEbitda: number | null;
  beta: number | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyDayAverage: number | null;
  twoHundredDayAverage: number | null;
  regularMarketVolume: number | null;
  averageDailyVolume3Month: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  debtToEquity: number | null;
  currentRatio: number | null;
  quickRatio: number | null;
  totalCash: number | null;
  totalDebt: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  trailingEps: number | null;
  forwardEps: number | null;
  bookValue: number | null;
  revenuePerShare: number | null;
  sharesOutstanding: number | null;
  floatShares: number | null;
  heldPercentInsiders: number | null;
  heldPercentInstitutions: number | null;
  shortPercentOfFloat: number | null;
  targetMeanPrice: number | null;
  targetMedianPrice: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
};

export type StockAnalysisBundle = {
  quote: StockQuote;
  income: IncomeStatementAnnual[];
  cashFlow: CashFlowAnnual[];
  /** Annual balance sheet lines aligned to income fiscal years. */
  balanceSheet: BalanceSheetAnnual[];
  /** Daily OHLCV, long history for range selector */
  historical: HistoricalEodBar[];
  /** 5m bars (recent sessions) for 1D view; optional if fetch fails */
  intraday?: HistoricalEodBar[];
  /** Valuation, margins, ownership — from quote + quoteSummary when available */
  investor: InvestorMetrics;
  /** Last N quarters — for trend charts (may be empty if fetch fails). */
  incomeQuarterly: IncomeStatementQuarter[];
  cashFlowQuarterly: CashFlowQuarter[];
  balanceSheetQuarterly: BalanceSheetQuarter[];
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

export function sortQuarterlyByDateAsc<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}
