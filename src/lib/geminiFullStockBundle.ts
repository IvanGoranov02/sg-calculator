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

  const nonZeroRevCount = income.filter(r => r.revenue > 0).length;
  if (income.length >= 2 && nonZeroRevCount < Math.ceil(income.length * 0.3)) {
    throw new Error(`Data quality: only ${nonZeroRevCount}/${income.length} annual rows have revenue > 0.`);
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


const MAX_HISTORY_YEARS = 10;
const MAX_QUARTERS = 40;

function perRequestTimeoutMs(): number {
  const raw = Number(process.env.GEMINI_STOCK_REQUEST_TIMEOUT_MS?.trim());
  if (Number.isFinite(raw) && raw >= 15_000) return Math.min(Math.floor(raw), 300_000);
  return 120_000;
}

/** Fire a single Gemini request and return parsed JSON. No responseSchema — lite models fill zeros with it. */
async function callGeminiJson(
  apiKey: string,
  model: string,
  prompt: string,
  maxTokens: number,
): Promise<unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

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
          maxOutputTokens: maxTokens,
          temperature: 0.15,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(perRequestTimeoutMs()),
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

  return parseJsonFromGemini(text);
}

function buildAnnualPrompt(sym: string): string {
  return `You output ONE JSON object (no markdown, no code fences) for ticker ${sym}.

**CRITICAL: Do NOT include historical/intraday price data. Only fundamentals.**
All numeric values in reporting currency at company scale (actual dollars, not thousands).

Provide data for the last ${MAX_HISTORY_YEARS} fiscal years, oldest first.

{
  "quote": { "symbol": "${sym}", "name": "Full Company Name", "price": 123.45, "change": -1.2, "changesPercentage": -0.97 },

  "investor": {
    "currency": "USD", "marketCap": N, "enterpriseValue": N, "trailingPE": N, "forwardPE": N,
    "pegRatio": N, "priceToSales": N, "priceToBook": N, "enterpriseToRevenue": N, "enterpriseToEbitda": N,
    "beta": N, "fiftyTwoWeekLow": N, "fiftyTwoWeekHigh": N, "fiftyDayAverage": N, "twoHundredDayAverage": N,
    "regularMarketVolume": N, "averageDailyVolume3Month": N,
    "grossMargins": 0.xx, "operatingMargins": 0.xx, "profitMargins": 0.xx,
    "returnOnEquity": 0.xx, "returnOnAssets": 0.xx, "revenueGrowth": 0.xx, "earningsGrowth": 0.xx,
    "debtToEquity": N, "currentRatio": N, "quickRatio": N, "totalCash": N, "totalDebt": N,
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
  ]
}

N = number or null. Dates ISO "YYYY-MM-DD" (fiscal period end).
Provide ${MAX_HISTORY_YEARS} years of annual data. Use 10-K figures.
Every field on every row — null when unavailable, never omit.`;
}

function buildQuarterlyIncomeCfPrompt(sym: string): string {
  return `You output ONE JSON object (no markdown, no code fences) with quarterly income + cash flow for ticker ${sym}.

**CRITICAL: No price data. Only quarterly income statements and cash flow statements.**
All numeric values in reporting currency at company scale (actual dollars, not thousands).

Provide up to ${MAX_QUARTERS} quarters (~${MAX_HISTORY_YEARS} years), oldest first:

{
  "incomeQuarterly": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}",
      "revenue": N, "grossProfit": N, "operatingExpenses": N, "netIncome": N,
      "operatingIncome": N, "ebitda": N, "dilutedEps": N, "dilutedAverageShares": N }
  ],

  "cashFlowQuarterly": [
    { "date": "YYYY-MM-DD", "symbol": "${sym}",
      "freeCashFlow": N, "operatingCashFlow": N, "capitalExpenditure": N,
      "investingCashFlow": N, "financingCashFlow": N, "dividendsPaid": N, "stockRepurchase": N }
  ]
}

N = number or null. Dates ISO "YYYY-MM-DD" (quarter period end).
Use 10-Q figures. Every field on every row — null when unavailable, never omit.`;
}

function buildQuarterlyBsDivPrompt(sym: string): string {
  return `You output ONE JSON object (no markdown, no code fences) with quarterly balance sheet + dividends for ticker ${sym}.

**CRITICAL: No price data. Only quarterly balance sheet and dividend data.**
All numeric values in reporting currency at company scale (actual dollars, not thousands).

Provide up to ${MAX_QUARTERS} quarters (~${MAX_HISTORY_YEARS} years), oldest first:

{
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

N = number or null. Dates ISO "YYYY-MM-DD" (quarter period end).
Use 10-Q figures. dividendPerShare = per-share dividend for that quarter, null if none.
Every field on every row — null when unavailable, never omit.`;
}

/**
 * Fetches stock data from Gemini in 3 sequential requests to avoid overwhelming the model:
 * 1) Quote + investor + annual statements (10 years)
 * 2) Quarterly income + cash flow (~40 quarters)
 * 3) Quarterly balance sheet + dividends (~40 quarters)
 */
export async function fetchStockBundleFromGemini(symbol: string): Promise<StockAnalysisBundle> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const sym = symbol.trim().toUpperCase() || "AAPL";
  const model = defaultGeminiModel();

  console.log(`[gemini] ${sym} part 1/3: quote + investor + annual statements…`);
  const part1 = (await callGeminiJson(
    apiKey, model, buildAnnualPrompt(sym), 16384,
  )) as Record<string, unknown>;

  console.log(`[gemini] ${sym} part 2/3: quarterly income + cash flow…`);
  const part2 = (await callGeminiJson(
    apiKey, model, buildQuarterlyIncomeCfPrompt(sym), 16384,
  )) as Record<string, unknown>;

  console.log(`[gemini] ${sym} part 3/3: quarterly balance sheet + dividends…`);
  const part3 = (await callGeminiJson(
    apiKey, model, buildQuarterlyBsDivPrompt(sym), 16384,
  )) as Record<string, unknown>;

  const merged = {
    quote: part1.quote,
    investor: part1.investor,
    income: part1.income,
    cashFlow: part1.cashFlow,
    balanceSheet: part1.balanceSheet,
    incomeQuarterly: part2.incomeQuarterly,
    cashFlowQuarterly: part2.cashFlowQuarterly,
    balanceSheetQuarterly: part3.balanceSheetQuarterly,
    dividendQuarterly: part3.dividendQuarterly,
  };

  return normalizeGeminiStockBundleJson(sym, merged);
}
