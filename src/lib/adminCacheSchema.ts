import { z } from "zod";

const num = z.number().finite();
const nullableNum = z.number().finite().nullable();
const str = z.string();

export const adminQuoteSchema = z.object({
  symbol: str,
  name: str,
  price: num,
  change: num,
  changesPercentage: num,
  marketState: str.optional(),
  postMarketPrice: nullableNum.optional(),
  postMarketChange: nullableNum.optional(),
  postMarketChangePercent: nullableNum.optional(),
  preMarketPrice: nullableNum.optional(),
  preMarketChange: nullableNum.optional(),
  preMarketChangePercent: nullableNum.optional(),
  earningsDate: z.string().nullable().optional(),
});

export const adminIncomeAnnualSchema = z.object({
  date: str,
  symbol: str,
  fiscalYear: str,
  revenue: num,
  grossProfit: num,
  operatingExpenses: num,
  netIncome: num,
  operatingIncome: num.optional(),
  ebitda: num.optional(),
  dilutedEps: num.optional(),
  dilutedAverageShares: num.optional(),
});

export const adminBalanceAnnualSchema = z.object({
  date: str,
  symbol: str,
  fiscalYear: str,
  totalAssets: nullableNum,
  totalDebt: nullableNum,
  netDebt: nullableNum,
  stockholdersEquity: nullableNum,
  cashAndCashEquivalents: nullableNum,
  totalCurrentAssets: nullableNum,
  totalCurrentLiabilities: nullableNum,
  inventory: nullableNum,
  accountsReceivable: nullableNum,
  goodwill: nullableNum,
  longTermDebt: nullableNum,
});

export const adminCashFlowAnnualSchema = z.object({
  date: str,
  symbol: str,
  fiscalYear: str,
  freeCashFlow: num,
  operatingCashFlow: nullableNum,
  capitalExpenditure: nullableNum,
  investingCashFlow: nullableNum,
  financingCashFlow: nullableNum,
  dividendsPaid: nullableNum,
  stockRepurchase: nullableNum,
});

export const adminIncomeQuarterSchema = z.object({
  date: str,
  symbol: str,
  revenue: num,
  grossProfit: num,
  operatingExpenses: num,
  netIncome: num,
  operatingIncome: num.optional(),
  ebitda: num.optional(),
  dilutedEps: num.optional(),
  dilutedAverageShares: num.optional(),
});

export const adminBalanceQuarterSchema = z.object({
  date: str,
  symbol: str,
  totalAssets: nullableNum,
  totalDebt: nullableNum,
  netDebt: nullableNum,
  stockholdersEquity: nullableNum,
  cashAndCashEquivalents: nullableNum,
  totalCurrentAssets: nullableNum,
  totalCurrentLiabilities: nullableNum,
  inventory: nullableNum,
  accountsReceivable: nullableNum,
  goodwill: nullableNum,
  longTermDebt: nullableNum,
});

export const adminCashFlowQuarterSchema = z.object({
  date: str,
  symbol: str,
  freeCashFlow: num,
  operatingCashFlow: nullableNum,
  capitalExpenditure: nullableNum,
  investingCashFlow: nullableNum,
  financingCashFlow: nullableNum,
  dividendsPaid: nullableNum,
  stockRepurchase: nullableNum,
});

export const adminDividendQuarterSchema = z.object({
  date: str,
  dividendPerShare: nullableNum,
});

export const adminInvestorSchema = z.object({
  currency: str,
  marketCap: nullableNum,
  enterpriseValue: nullableNum,
  trailingPE: nullableNum,
  forwardPE: nullableNum,
  pegRatio: nullableNum,
  priceToSales: nullableNum,
  priceToBook: nullableNum,
  enterpriseToRevenue: nullableNum,
  enterpriseToEbitda: nullableNum,
  beta: nullableNum,
  fiftyTwoWeekLow: nullableNum,
  fiftyTwoWeekHigh: nullableNum,
  fiftyDayAverage: nullableNum,
  twoHundredDayAverage: nullableNum,
  regularMarketVolume: nullableNum,
  averageDailyVolume3Month: nullableNum,
  grossMargins: nullableNum,
  operatingMargins: nullableNum,
  profitMargins: nullableNum,
  returnOnEquity: nullableNum,
  returnOnAssets: nullableNum,
  revenueGrowth: nullableNum,
  earningsGrowth: nullableNum,
  debtToEquity: nullableNum,
  currentRatio: nullableNum,
  quickRatio: nullableNum,
  totalCash: nullableNum,
  totalDebt: nullableNum,
  dividendRate: nullableNum,
  dividendYield: nullableNum,
  payoutRatio: nullableNum,
  trailingEps: nullableNum,
  forwardEps: nullableNum,
  bookValue: nullableNum,
  revenuePerShare: nullableNum,
  sharesOutstanding: nullableNum,
  floatShares: nullableNum,
  heldPercentInsiders: nullableNum,
  heldPercentInstitutions: nullableNum,
  shortPercentOfFloat: nullableNum,
  targetMeanPrice: nullableNum,
  targetMedianPrice: nullableNum,
  recommendationKey: z.string().nullable(),
  numberOfAnalystOpinions: nullableNum,
});

export const adminEditableBundleSchema = z.object({
  quote: adminQuoteSchema,
  income: z.array(adminIncomeAnnualSchema),
  cashFlow: z.array(adminCashFlowAnnualSchema),
  balanceSheet: z.array(adminBalanceAnnualSchema),
  incomeQuarterly: z.array(adminIncomeQuarterSchema),
  cashFlowQuarterly: z.array(adminCashFlowQuarterSchema),
  balanceSheetQuarterly: z.array(adminBalanceQuarterSchema),
  dividendQuarterly: z.array(adminDividendQuarterSchema),
  investor: adminInvestorSchema,
});

export type AdminEditableBundle = z.infer<typeof adminEditableBundleSchema>;
