/**
 * Server-only: build a full {@link StockAnalysisBundle} from Gemini JSON (no Yahoo/SEC).
 * Data is illustrative — users must verify against filings.
 */

import { defaultGeminiModel, getGeminiApiKey } from "@/lib/geminiClient";
import {
  sortQuarterlyByDateAsc,
  type HistoricalEodBar,
  type InvestorMetrics,
  type StockAnalysisBundle,
  type StockQuote,
} from "@/lib/stockAnalysisTypes";

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
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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

function normalizeHistorical(raw: unknown): HistoricalEodBar[] {
  if (!Array.isArray(raw)) return [];
  const out: HistoricalEodBar[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const date = str(r.date, "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const close = num(r.close, NaN);
    if (!Number.isFinite(close)) continue;
    out.push({
      date,
      close,
      high: numOrNull(r.high) ?? undefined,
      low: numOrNull(r.low) ?? undefined,
      volume: numOrNull(r.volume) ?? undefined,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Turn Gemini JSON into a strict bundle; throws if unusable. */
export function normalizeGeminiStockBundleJson(sym: string, parsed: unknown): StockAnalysisBundle {
  if (!parsed || typeof parsed !== "object") throw new Error("Gemini returned non-object JSON.");
  const b = parsed as Record<string, unknown>;

  const quote = normalizeQuote(sym, b.quote);
  const investor = normalizeInvestor(b.investor);
  let historical = normalizeHistorical(b.historical);
  if (historical.length === 0) {
    const d = new Date().toISOString().slice(0, 10);
    historical = [{ date: d, close: quote.price > 0 ? quote.price : 1 }];
  }

  const income = Array.isArray(b.income) ? b.income : [];
  const cashFlow = Array.isArray(b.cashFlow) ? b.cashFlow : [];
  const balanceSheet = Array.isArray(b.balanceSheet) ? b.balanceSheet : [];
  const incomeQuarterly = Array.isArray(b.incomeQuarterly) ? b.incomeQuarterly : [];
  const cashFlowQuarterly = Array.isArray(b.cashFlowQuarterly) ? b.cashFlowQuarterly : [];
  const balanceSheetQuarterly = Array.isArray(b.balanceSheetQuarterly) ? b.balanceSheetQuarterly : [];
  const dividendQuarterly = Array.isArray(b.dividendQuarterly) ? b.dividendQuarterly : [];

  if (income.length === 0) throw new Error("Gemini JSON missing annual income.");
  if (incomeQuarterly.length < 4) throw new Error("Gemini JSON needs at least 4 quarterly income rows.");

  const withSym = <T extends { symbol?: string }>(rows: T[]) =>
    rows.map((r) => ({ ...r, symbol: str(r.symbol, sym) }));

  const intradayRaw = b.intraday;
  let intraday: StockAnalysisBundle["intraday"];
  if (Array.isArray(intradayRaw) && intradayRaw.length > 0) {
    intraday = normalizeHistorical(intradayRaw).map((x) => ({
      date: x.date,
      close: x.close,
    }));
  }

  return {
    quote,
    investor,
    historical,
    intraday,
    income: sortAnnualByFy(withSym(income as StockAnalysisBundle["income"])),
    cashFlow: sortAnnualByFy(withSym(cashFlow as StockAnalysisBundle["cashFlow"])),
    balanceSheet: sortAnnualByFy(withSym(balanceSheet as StockAnalysisBundle["balanceSheet"])),
    incomeQuarterly: sortQuarterlyByDateAsc(withSym(incomeQuarterly as StockAnalysisBundle["incomeQuarterly"])),
    cashFlowQuarterly: sortQuarterlyByDateAsc(
      withSym(cashFlowQuarterly as StockAnalysisBundle["cashFlowQuarterly"]),
    ),
    balanceSheetQuarterly: sortQuarterlyByDateAsc(
      withSym(balanceSheetQuarterly as StockAnalysisBundle["balanceSheetQuarterly"]),
    ),
    dividendQuarterly: sortQuarterlyByDateAsc(
      dividendQuarterly as StockAnalysisBundle["dividendQuarterly"],
    ),
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
FULL HISTORY (this JSON is cached once in our DB — include as much as fits; UI will slice by date later):
- **Annual** income, cashFlow, balanceSheet: every fiscal year you can justify from public 10-K-style data, ideally back toward IPO or the 1990s for US large-caps (minimum target ~15–20 fiscal years if the company existed that long).
- **Quarterly** incomeQuarterly, cashFlowQuarterly, balanceSheetQuarterly, dividendQuarterly: same period-end dates for the first three; **all quarters** you can back through at least ~15–20 years where 10-Q/10-K data exists (aligned row counts, sorted by period end).
- **historical** daily bars: optional short placeholder (server replaces with **Yahoo Finance** OHLCV on load); prioritize fundamentals row count over price history in this JSON.
`
    : `
Include a reasonably long history: several years of annuals and many quarters; daily OHLCV can be minimal (Yahoo fills prices server-side).
`;

  const prompt = `You output ONE JSON object only (no markdown) for US equity ticker ${sym}.

This object is stored **once** server-side; the app will filter by period in memory — you must output the **widest** history you can in one JSON.
${depthBlock}

Use widely reported 10-K / 10-Q figures you are confident about. Numbers must be internally consistent (same fiscal calendar, same currency).

Required top-level keys:
- quote: { symbol, name, price, change, changesPercentage, marketState?, earningsDate? (ISO date) }
- investor: object with keys like currency, marketCap, trailingPE, dividendYield, beta, fiftyTwoWeekHigh, fiftyTwoWeekLow — use null where unknown
- historical: minimal daily rows OK (Yahoo overwrites with real market history)
- intraday?: optional [ { date ISO datetime string, close } ] for recent sessions only
- income: annual array — full history as above
- cashFlow, balanceSheet: annual — aligned fiscal years to income
- incomeQuarterly, cashFlowQuarterly, balanceSheetQuarterly, dividendQuarterly: quarterly rows, ISO period-end date, symbol "${sym}", **aligned lengths** for the three statement arrays; dividendQuarterly { date, dividendPerShare }

Use the same symbol string "${sym}" on every row. Numbers are company scale (not per share except dilutedEps and dividendPerShare).`;

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
