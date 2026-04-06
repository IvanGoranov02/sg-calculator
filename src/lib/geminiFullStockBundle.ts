/**
 * Server-only: build a full {@link StockAnalysisBundle} from Gemini JSON (no Yahoo/SEC).
 * Data is illustrative — users must verify against filings.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import {
  sortQuarterlyByDateAsc,
  type BalanceSheetAnnual,
  type BalanceSheetQuarter,
  type CashFlowAnnual,
  type CashFlowQuarter,
  type DividendQuarterlyPoint,
  type HistoricalEodBar,
  type IncomeStatementAnnual,
  type IncomeStatementQuarter,
  type InvestorMetrics,
  type StockAnalysisBundle,
  type StockQuote,
} from "@/lib/stockAnalysisTypes";

function stubCashFlowQuarter(sym: string, dateIso: string, netIncome: number): CashFlowQuarter {
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

function stubBalanceQuarter(sym: string, dateIso: string): BalanceSheetQuarter {
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

/** Gemini often returns fewer CF/BS/div rows than income quarters — align by period-end date. */
function alignQuarterlyToIncome(
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
    cashFlowQuarterly.push(cfBy.get(d) ?? stubCashFlowQuarter(sym, d, inc.netIncome));
    balanceSheetQuarterly.push(bsBy.get(d) ?? stubBalanceQuarter(sym, d));
    const dv = divBy.get(d);
    dividendQuarterly.push(dv ?? { date: d, dividendPerShare: null });
  }

  return { cashFlowQuarterly, balanceSheetQuarterly, dividendQuarterly };
}

function sortAnnualByFy<T extends { fiscalYear: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
}

/** Ensure cashFlow and balanceSheet have a row for every income fiscalYear. */
function alignAnnualToIncome(
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

function parseJsonFromGemini(text: string): unknown {
  const t = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(t);
  const raw = fence ? fence[1].trim() : t;
  return JSON.parse(raw);
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function numOrUndef(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function normalizeInvestor(raw: unknown): InvestorMetrics {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    currency: str(o.currency, "USD"),
    marketCap: numOrNull(o.marketCap),
    enterpriseValue: numOrNull(o.enterpriseValue),
    trailingPE: numOrNull(o.trailingPE),
    forwardPE: numOrNull(o.forwardPE),
    pegRatio: numOrNull(o.pegRatio),
    priceToSales: numOrNull(o.priceToSales),
    priceToBook: numOrNull(o.priceToBook),
    enterpriseToRevenue: numOrNull(o.enterpriseToRevenue),
    enterpriseToEbitda: numOrNull(o.enterpriseToEbitda),
    beta: numOrNull(o.beta),
    fiftyTwoWeekLow: numOrNull(o.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: numOrNull(o.fiftyTwoWeekHigh),
    fiftyDayAverage: numOrNull(o.fiftyDayAverage),
    twoHundredDayAverage: numOrNull(o.twoHundredDayAverage),
    regularMarketVolume: numOrNull(o.regularMarketVolume),
    averageDailyVolume3Month: numOrNull(o.averageDailyVolume3Month),
    grossMargins: numOrNull(o.grossMargins),
    operatingMargins: numOrNull(o.operatingMargins),
    profitMargins: numOrNull(o.profitMargins),
    returnOnEquity: numOrNull(o.returnOnEquity),
    returnOnAssets: numOrNull(o.returnOnAssets),
    revenueGrowth: numOrNull(o.revenueGrowth),
    earningsGrowth: numOrNull(o.earningsGrowth),
    debtToEquity: numOrNull(o.debtToEquity),
    currentRatio: numOrNull(o.currentRatio),
    quickRatio: numOrNull(o.quickRatio),
    totalCash: numOrNull(o.totalCash),
    totalDebt: numOrNull(o.totalDebt),
    dividendRate: numOrNull(o.dividendRate),
    dividendYield: numOrNull(o.dividendYield),
    payoutRatio: numOrNull(o.payoutRatio),
    trailingEps: numOrNull(o.trailingEps),
    forwardEps: numOrNull(o.forwardEps),
    bookValue: numOrNull(o.bookValue),
    revenuePerShare: numOrNull(o.revenuePerShare),
    sharesOutstanding: numOrNull(o.sharesOutstanding),
    floatShares: numOrNull(o.floatShares),
    heldPercentInsiders: numOrNull(o.heldPercentInsiders),
    heldPercentInstitutions: numOrNull(o.heldPercentInstitutions),
    shortPercentOfFloat: numOrNull(o.shortPercentOfFloat),
    targetMeanPrice: numOrNull(o.targetMeanPrice),
    targetMedianPrice: numOrNull(o.targetMedianPrice),
    recommendationKey: o.recommendationKey != null ? String(o.recommendationKey) : null,
    numberOfAnalystOpinions: numOrNull(o.numberOfAnalystOpinions),
  };
}

function normalizeQuote(sym: string, raw: unknown): StockQuote {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o) {
    return {
      symbol: sym.toUpperCase(),
      name: sym,
      price: 0,
      change: 0,
      changesPercentage: 0,
      earningsDate: null,
    };
  }
  return {
    symbol: str(o.symbol, sym).toUpperCase(),
    name: str(o.name, sym),
    price: num(o.price, 0),
    change: num(o.change, 0),
    changesPercentage: num(o.changesPercentage, 0),
    marketState: typeof o.marketState === "string" ? o.marketState : undefined,
    postMarketPrice: numOrNull(o.postMarketPrice),
    postMarketChange: numOrNull(o.postMarketChange),
    postMarketChangePercent: numOrNull(o.postMarketChangePercent),
    preMarketPrice: numOrNull(o.preMarketPrice),
    preMarketChange: numOrNull(o.preMarketChange),
    preMarketChangePercent: numOrNull(o.preMarketChangePercent),
    earningsDate: o.earningsDate != null ? String(o.earningsDate).slice(0, 10) : null,
  };
}

/* ---------- per-row normalizers (map Gemini's arbitrary names → our typed fields) ---------- */

function pick(o: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}

function isoDate(v: unknown): string {
  if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
  return "";
}

function normalizeIncomeAnnual(sym: string, raw: unknown): IncomeStatementAnnual | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  const fy = str(pick(o, "fiscalYear", "fiscal_year", "year") as string, "");
  if (!date && !fy) return null;
  return {
    date: date || `${fy}-12-31`,
    symbol: str(o.symbol as string, sym),
    fiscalYear: fy || date.slice(0, 4),
    revenue: num(pick(o, "revenue", "totalRevenue", "total_revenue")),
    grossProfit: num(pick(o, "grossProfit", "gross_profit")),
    operatingExpenses: num(pick(o, "operatingExpenses", "operating_expenses", "operatingExpense", "opex")),
    netIncome: num(pick(o, "netIncome", "net_income", "netEarnings")),
    operatingIncome: numOrUndef(pick(o, "operatingIncome", "operating_income", "operatingProfit")),
    ebitda: numOrUndef(pick(o, "ebitda", "EBITDA")),
    dilutedEps: numOrUndef(pick(o, "dilutedEps", "diluted_eps", "dilutedEPS", "eps", "earningsPerShare")),
    dilutedAverageShares: numOrUndef(pick(o, "dilutedAverageShares", "diluted_average_shares", "sharesOutstanding", "weightedAverageShares", "dilutedShares")),
  };
}

function normalizeCashFlowAnnual(sym: string, raw: unknown): CashFlowAnnual | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  const fy = str(pick(o, "fiscalYear", "fiscal_year", "year") as string, "");
  if (!date && !fy) return null;
  return {
    date: date || `${fy}-12-31`,
    symbol: str(o.symbol as string, sym),
    fiscalYear: fy || date.slice(0, 4),
    freeCashFlow: num(pick(o, "freeCashFlow", "free_cash_flow", "fcf", "FCF")),
    operatingCashFlow: numOrNull(pick(o, "operatingCashFlow", "operating_cash_flow", "cashFromOperations", "operatingCashflow")),
    capitalExpenditure: numOrNull(pick(o, "capitalExpenditure", "capital_expenditure", "capex", "capitalExpenditures")),
    investingCashFlow: numOrNull(pick(o, "investingCashFlow", "investing_cash_flow", "cashFromInvesting")),
    financingCashFlow: numOrNull(pick(o, "financingCashFlow", "financing_cash_flow", "cashFromFinancing")),
    dividendsPaid: numOrNull(pick(o, "dividendsPaid", "dividends_paid", "dividendPaid", "cashDividendsPaid")),
    stockRepurchase: numOrNull(pick(o, "stockRepurchase", "stock_repurchase", "shareRepurchase", "buybacks", "commonStockRepurchased")),
  };
}

function normalizeBalanceAnnual(sym: string, raw: unknown): BalanceSheetAnnual | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  const fy = str(pick(o, "fiscalYear", "fiscal_year", "year") as string, "");
  if (!date && !fy) return null;
  return {
    date: date || `${fy}-12-31`,
    symbol: str(o.symbol as string, sym),
    fiscalYear: fy || date.slice(0, 4),
    totalAssets: numOrNull(pick(o, "totalAssets", "total_assets")),
    totalDebt: numOrNull(pick(o, "totalDebt", "total_debt")),
    netDebt: numOrNull(pick(o, "netDebt", "net_debt")),
    stockholdersEquity: numOrNull(pick(o, "stockholdersEquity", "stockholders_equity", "shareholdersEquity", "shareholders_equity", "totalStockholdersEquity", "equity")),
    cashAndCashEquivalents: numOrNull(pick(o, "cashAndCashEquivalents", "cash_and_cash_equivalents", "cashAndEquivalents", "cash")),
    totalCurrentAssets: numOrNull(pick(o, "totalCurrentAssets", "total_current_assets", "currentAssets")),
    totalCurrentLiabilities: numOrNull(pick(o, "totalCurrentLiabilities", "total_current_liabilities", "currentLiabilities")),
    inventory: numOrNull(pick(o, "inventory", "inventories")),
    accountsReceivable: numOrNull(pick(o, "accountsReceivable", "accounts_receivable", "receivables")),
    goodwill: numOrNull(pick(o, "goodwill")),
    longTermDebt: numOrNull(pick(o, "longTermDebt", "long_term_debt", "longTermBorrowings")),
  };
}

function normalizeIncomeQuarter(sym: string, raw: unknown): IncomeStatementQuarter | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  if (!date) return null;
  return {
    date,
    symbol: str(o.symbol as string, sym),
    revenue: num(pick(o, "revenue", "totalRevenue", "total_revenue")),
    grossProfit: num(pick(o, "grossProfit", "gross_profit")),
    operatingExpenses: num(pick(o, "operatingExpenses", "operating_expenses", "operatingExpense", "opex")),
    netIncome: num(pick(o, "netIncome", "net_income", "netEarnings")),
    operatingIncome: numOrUndef(pick(o, "operatingIncome", "operating_income", "operatingProfit")),
    ebitda: numOrUndef(pick(o, "ebitda", "EBITDA")),
    dilutedEps: numOrUndef(pick(o, "dilutedEps", "diluted_eps", "dilutedEPS", "eps", "earningsPerShare")),
    dilutedAverageShares: numOrUndef(pick(o, "dilutedAverageShares", "diluted_average_shares", "sharesOutstanding", "weightedAverageShares", "dilutedShares")),
  };
}

function normalizeCashFlowQuarter(sym: string, raw: unknown): CashFlowQuarter | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  if (!date) return null;
  return {
    date,
    symbol: str(o.symbol as string, sym),
    freeCashFlow: num(pick(o, "freeCashFlow", "free_cash_flow", "fcf", "FCF")),
    operatingCashFlow: numOrNull(pick(o, "operatingCashFlow", "operating_cash_flow", "cashFromOperations", "operatingCashflow")),
    capitalExpenditure: numOrNull(pick(o, "capitalExpenditure", "capital_expenditure", "capex", "capitalExpenditures")),
    investingCashFlow: numOrNull(pick(o, "investingCashFlow", "investing_cash_flow", "cashFromInvesting")),
    financingCashFlow: numOrNull(pick(o, "financingCashFlow", "financing_cash_flow", "cashFromFinancing")),
    dividendsPaid: numOrNull(pick(o, "dividendsPaid", "dividends_paid", "dividendPaid", "cashDividendsPaid")),
    stockRepurchase: numOrNull(pick(o, "stockRepurchase", "stock_repurchase", "shareRepurchase", "buybacks", "commonStockRepurchased")),
  };
}

function normalizeBalanceQuarter(sym: string, raw: unknown): BalanceSheetQuarter | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  if (!date) return null;
  return {
    date,
    symbol: str(o.symbol as string, sym),
    totalAssets: numOrNull(pick(o, "totalAssets", "total_assets")),
    totalDebt: numOrNull(pick(o, "totalDebt", "total_debt")),
    netDebt: numOrNull(pick(o, "netDebt", "net_debt")),
    stockholdersEquity: numOrNull(pick(o, "stockholdersEquity", "stockholders_equity", "shareholdersEquity", "shareholders_equity", "totalStockholdersEquity", "equity")),
    cashAndCashEquivalents: numOrNull(pick(o, "cashAndCashEquivalents", "cash_and_cash_equivalents", "cashAndEquivalents", "cash")),
    totalCurrentAssets: numOrNull(pick(o, "totalCurrentAssets", "total_current_assets", "currentAssets")),
    totalCurrentLiabilities: numOrNull(pick(o, "totalCurrentLiabilities", "total_current_liabilities", "currentLiabilities")),
    inventory: numOrNull(pick(o, "inventory", "inventories")),
    accountsReceivable: numOrNull(pick(o, "accountsReceivable", "accounts_receivable", "receivables")),
    goodwill: numOrNull(pick(o, "goodwill")),
    longTermDebt: numOrNull(pick(o, "longTermDebt", "long_term_debt", "longTermBorrowings")),
  };
}

function normalizeDividendQuarter(raw: unknown): DividendQuarterlyPoint | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = isoDate(pick(o, "date", "periodEnd", "period"));
  if (!date) return null;
  return {
    date,
    dividendPerShare: numOrNull(pick(o, "dividendPerShare", "dividend_per_share", "dps", "dividend")),
  };
}

/** Turn Gemini JSON into a strict bundle; throws if unusable. */
export function normalizeGeminiStockBundleJson(sym: string, parsed: unknown): StockAnalysisBundle {
  if (!parsed || typeof parsed !== "object") throw new Error("Gemini returned non-object JSON.");
  const b = parsed as Record<string, unknown>;

  // Never use Gemini for OHLCV — it burns output tokens and can truncate fundamentals JSON.
  delete b.historical;
  delete b.intraday;

  const quote = normalizeQuote(sym, b.quote);
  const investor = normalizeInvestor(b.investor);
  const d = new Date().toISOString().slice(0, 10);
  const historical: HistoricalEodBar[] = [
    { date: d, close: quote.price > 0 ? quote.price : 1 },
  ];

  const rawIncome = Array.isArray(b.income) ? b.income : [];
  const rawCashFlow = Array.isArray(b.cashFlow) ? b.cashFlow : [];
  const rawBalanceSheet = Array.isArray(b.balanceSheet) ? b.balanceSheet : [];
  const rawIncomeQ = Array.isArray(b.incomeQuarterly) ? b.incomeQuarterly : [];
  const rawCfQ = Array.isArray(b.cashFlowQuarterly) ? b.cashFlowQuarterly : [];
  const rawBsQ = Array.isArray(b.balanceSheetQuarterly) ? b.balanceSheetQuarterly : [];
  const rawDivQ = Array.isArray(b.dividendQuarterly) ? b.dividendQuarterly : [];

  const income = rawIncome.map((r: unknown) => normalizeIncomeAnnual(sym, r)).filter(Boolean) as StockAnalysisBundle["income"];
  const cashFlow = rawCashFlow.map((r: unknown) => normalizeCashFlowAnnual(sym, r)).filter(Boolean) as StockAnalysisBundle["cashFlow"];
  const balanceSheet = rawBalanceSheet.map((r: unknown) => normalizeBalanceAnnual(sym, r)).filter(Boolean) as StockAnalysisBundle["balanceSheet"];
  const incomeQ = rawIncomeQ.map((r: unknown) => normalizeIncomeQuarter(sym, r)).filter(Boolean) as StockAnalysisBundle["incomeQuarterly"];
  const cfQ = rawCfQ.map((r: unknown) => normalizeCashFlowQuarter(sym, r)).filter(Boolean) as StockAnalysisBundle["cashFlowQuarterly"];
  const bsQ = rawBsQ.map((r: unknown) => normalizeBalanceQuarter(sym, r)).filter(Boolean) as StockAnalysisBundle["balanceSheetQuarterly"];
  const divQ = rawDivQ.map((r: unknown) => normalizeDividendQuarter(r)).filter(Boolean) as StockAnalysisBundle["dividendQuarterly"];

  if (income.length === 0) throw new Error("Gemini JSON missing annual income.");
  if (incomeQ.length < 1) {
    throw new Error("Gemini JSON needs at least one quarterly income row.");
  }

  const sortedIncome = sortAnnualByFy(income);
  const sortedCf = sortAnnualByFy(cashFlow);
  const sortedBs = sortAnnualByFy(balanceSheet);

  const alignedAnnual = alignAnnualToIncome(sym, sortedIncome, sortedCf, sortedBs);

  const sortedIncomeQ = sortQuarterlyByDateAsc(incomeQ);
  const aligned = alignQuarterlyToIncome(sym, sortedIncomeQ, sortQuarterlyByDateAsc(cfQ), sortQuarterlyByDateAsc(bsQ), sortQuarterlyByDateAsc(divQ));

  return {
    quote,
    investor,
    historical,
    intraday: undefined,
    income: sortedIncome,
    cashFlow: alignedAnnual.cashFlow,
    balanceSheet: alignedAnnual.balanceSheet,
    incomeQuarterly: sortedIncomeQ,
    cashFlowQuarterly: aligned.cashFlowQuarterly,
    balanceSheetQuarterly: aligned.balanceSheetQuarterly,
    dividendQuarterly: aligned.dividendQuarterly,
  };
}


function fullHistoryPromptEnabled(): boolean {
  const v = process.env.GEMINI_STOCK_FULL_HISTORY?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

function maxOutputTokensForStockBundle(): number {
  const raw = Number(process.env.GEMINI_STOCK_MAX_OUTPUT_TOKENS?.trim());
  if (Number.isFinite(raw) && raw >= 4096) return Math.min(Math.floor(raw), 65536);
  return 65536;
}

function requestTimeoutMs(): number {
  const raw = Number(process.env.GEMINI_STOCK_REQUEST_TIMEOUT_MS?.trim());
  if (Number.isFinite(raw) && raw >= 30_000) return Math.min(Math.floor(raw), 600_000);
  return 240_000;
}

export async function fetchStockBundleFromGemini(symbol: string): Promise<StockAnalysisBundle> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Stock analysis now uses Gemini when the cache is empty.",
    );
  }

  const sym = symbol.trim().toUpperCase() || "AAPL";
  const model = defaultGeminiModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const depthBlock = fullHistoryPromptEnabled()
    ? `
MAXIMUM FUNDAMENTALS (this JSON is cached once; UI slices by period later). **Do not waste tokens on stock prices.**
- **Annual** income, cashFlow, balanceSheet: as many fiscal years as you can (target 15–20+ years for mature US listings).
- **Quarterly** incomeQuarterly, cashFlowQuarterly, balanceSheetQuarterly, dividendQuarterly: aligned period-end dates, as many quarters as fit (target 15–20+ years of quarters).
`
    : `
Include several years of annuals and many quarters of fundamentals.
`;

  const prompt = `You output ONE JSON object only (no markdown, no code fences) for equity ticker ${sym}.

**CRITICAL RULES:**
1. Do **NOT** include \`historical\` or \`intraday\` keys. Price data comes from Yahoo. Every token must go into fundamentals.
2. A long price series WILL truncate your JSON and destroy annual/quarterly data — the payload becomes broken.
3. ALL numeric financial values must be in the reporting currency at company scale (e.g. revenue in actual dollars, not thousands or millions, unless the company reports in thousands).
4. Use **exactly** the field names shown below — the parser maps them by name.

${depthBlock}

## EXACT JSON SCHEMA — use these field names:

\`\`\`
{
  "quote": { "symbol": "${sym}", "name": "Company Name", "price": 123.45, "change": -1.2, "changesPercentage": -0.97 },

  "investor": {
    "currency": "USD", "marketCap": N, "enterpriseValue": N, "trailingPE": N, "forwardPE": N,
    "pegRatio": N, "priceToSales": N, "priceToBook": N, "enterpriseToRevenue": N, "enterpriseToEbitda": N,
    "beta": N, "fiftyTwoWeekLow": N, "fiftyTwoWeekHigh": N, "fiftyDayAverage": N, "twoHundredDayAverage": N,
    "regularMarketVolume": N, "averageDailyVolume3Month": N,
    "grossMargins": 0.xx, "operatingMargins": 0.xx, "profitMargins": 0.xx,
    "returnOnEquity": 0.xx, "returnOnAssets": 0.xx,
    "revenueGrowth": 0.xx, "earningsGrowth": 0.xx,
    "debtToEquity": N, "currentRatio": N, "quickRatio": N,
    "totalCash": N, "totalDebt": N,
    "dividendRate": N, "dividendYield": 0.xx, "payoutRatio": 0.xx,
    "trailingEps": N, "forwardEps": N, "bookValue": N, "revenuePerShare": N,
    "sharesOutstanding": N, "floatShares": N,
    "heldPercentInsiders": 0.xx, "heldPercentInstitutions": 0.xx, "shortPercentOfFloat": 0.xx,
    "targetMeanPrice": N, "targetMedianPrice": N, "recommendationKey": "buy", "numberOfAnalystOpinions": N
  },

  "income": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}", "fiscalYear": "YYYY",
      "revenue": N, "grossProfit": N, "operatingExpenses": N, "netIncome": N,
      "operatingIncome": N, "ebitda": N, "dilutedEps": N, "dilutedAverageShares": N }
  ],

  "cashFlow": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}", "fiscalYear": "YYYY",
      "freeCashFlow": N, "operatingCashFlow": N, "capitalExpenditure": N,
      "investingCashFlow": N, "financingCashFlow": N, "dividendsPaid": N, "stockRepurchase": N }
  ],

  "balanceSheet": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}", "fiscalYear": "YYYY",
      "totalAssets": N, "totalDebt": N, "netDebt": N, "stockholdersEquity": N,
      "cashAndCashEquivalents": N, "totalCurrentAssets": N, "totalCurrentLiabilities": N,
      "inventory": N, "accountsReceivable": N, "goodwill": N, "longTermDebt": N }
  ],

  "incomeQuarterly": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}",
      "revenue": N, "grossProfit": N, "operatingExpenses": N, "netIncome": N,
      "operatingIncome": N, "ebitda": N, "dilutedEps": N, "dilutedAverageShares": N }
  ],

  "cashFlowQuarterly": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}",
      "freeCashFlow": N, "operatingCashFlow": N, "capitalExpenditure": N,
      "investingCashFlow": N, "financingCashFlow": N, "dividendsPaid": N, "stockRepurchase": N }
  ],

  "balanceSheetQuarterly": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}",
      "totalAssets": N, "totalDebt": N, "netDebt": N, "stockholdersEquity": N,
      "cashAndCashEquivalents": N, "totalCurrentAssets": N, "totalCurrentLiabilities": N,
      "inventory": N, "accountsReceivable": N, "goodwill": N, "longTermDebt": N }
  ],

  "dividendQuarterly": [
    { "date": "YYYY-MM-DD", "dividendPerShare": N }
  ]
}
\`\`\`

**N** = number or null. Use null when data is unavailable — never omit the key.
Dates are ISO "YYYY-MM-DD" (fiscal period end). Use "${sym}" on every fundamentals row.
Provide **every field** for every row — this is critical. Do not skip fields.

Use widely reported 10-K / 10-Q figures. Same fiscal calendar and currency throughout.`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxOutputTokensForStockBundle(),
          temperature: 0.15,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(requestTimeoutMs()),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "network error";
    throw new Error(`Gemini request failed: ${msg}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 400)}`);
  }

  const raw = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text =
    raw?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")?.trim() ?? "";
  if (!text) throw new Error("Empty Gemini response.");

  let parsed: unknown;
  try {
    parsed = parseJsonFromGemini(text);
  } catch (e) {
    throw new Error(`Gemini JSON parse failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  return normalizeGeminiStockBundleJson(sym, parsed);
}
