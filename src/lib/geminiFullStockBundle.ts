/**
 * Server-only: build a full {@link StockAnalysisBundle} from Gemini JSON (no Yahoo/SEC).
 * Data is illustrative — users must verify against filings.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import {
  sortQuarterlyByDateAsc,
  type BalanceSheetQuarter,
  type CashFlowQuarter,
  type DividendQuarterlyPoint,
  type HistoricalEodBar,
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

  const income = Array.isArray(b.income) ? b.income : [];
  const cashFlow = Array.isArray(b.cashFlow) ? b.cashFlow : [];
  const balanceSheet = Array.isArray(b.balanceSheet) ? b.balanceSheet : [];
  const incomeQuarterly = Array.isArray(b.incomeQuarterly) ? b.incomeQuarterly : [];
  const cashFlowQuarterly = Array.isArray(b.cashFlowQuarterly) ? b.cashFlowQuarterly : [];
  const balanceSheetQuarterly = Array.isArray(b.balanceSheetQuarterly) ? b.balanceSheetQuarterly : [];
  const dividendQuarterly = Array.isArray(b.dividendQuarterly) ? b.dividendQuarterly : [];

  if (income.length === 0) throw new Error("Gemini JSON missing annual income.");
  if (incomeQuarterly.length < 1) {
    throw new Error("Gemini JSON needs at least one quarterly income row.");
  }

  const withSym = <T extends { symbol?: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, symbol: str(r.symbol, sym) }));

  const incomeQ = sortQuarterlyByDateAsc(withSym(incomeQuarterly as StockAnalysisBundle["incomeQuarterly"]));
  const cfQ = sortQuarterlyByDateAsc(withSym(cashFlowQuarterly as StockAnalysisBundle["cashFlowQuarterly"]));
  const bsQ = sortQuarterlyByDateAsc(withSym(balanceSheetQuarterly as StockAnalysisBundle["balanceSheetQuarterly"]));
  const divQ = sortQuarterlyByDateAsc(dividendQuarterly as StockAnalysisBundle["dividendQuarterly"]);
  const aligned = alignQuarterlyToIncome(sym, incomeQ, cfQ, bsQ, divQ);

  return {
    quote,
    investor,
    historical,
    intraday: undefined,
    income: sortAnnualByFy(withSym(income as StockAnalysisBundle["income"])),
    cashFlow: sortAnnualByFy(withSym(cashFlow as StockAnalysisBundle["cashFlow"])),
    balanceSheet: sortAnnualByFy(withSym(balanceSheet as StockAnalysisBundle["balanceSheet"])),
    incomeQuarterly: incomeQ,
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

  const prompt = `You output ONE JSON object only (no markdown) for US equity ticker ${sym}.

**CRITICAL:** Do **not** include \`historical\` or \`intraday\` keys. Daily/intraday OHLCV is loaded separately (Yahoo). Put **every** token into income / cash flow / balance sheet / dividends / investor context — a long price series will truncate your JSON and **wipe** annual income (broken payload).

${depthBlock}

Use widely reported 10-K / 10-Q figures. Same fiscal calendar and currency throughout.

Required top-level keys (no historical, no intraday):
- quote: { symbol, name, price?, change?, changesPercentage? } — rough snapshot OK; server refreshes price from Yahoo
- investor: currency, marketCap, trailingPE, dividendYield, beta, etc. — nulls OK
- income, cashFlow, balanceSheet: annual arrays
- incomeQuarterly, cashFlowQuarterly, balanceSheetQuarterly, dividendQuarterly: quarterly; symbol "${sym}"; **≥1** income quarter (prefer **≥8**); align CF/BS dates to income quarters when possible

Use "${sym}" on every fundamentals row. Company-scale USD amounts unless the listing is different.`;

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
