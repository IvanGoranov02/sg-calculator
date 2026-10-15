import { quoteCurrencyMajor } from "@/lib/portfolioFx";
import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";

export function stockFundamentalsCurrency(bundle: StockAnalysisBundle): string {
  return (bundle as StockAnalysisBundle & { __displayFundamentalsCurrency?: string }).__displayFundamentalsCurrency
    ?? bundle.investor.currency ?? "USD";
}

/** Keep prices and history in the same major units; EPS already uses reporting major units. */
export function normalizeStockQuoteUnits(bundle: StockAnalysisBundle, rawCurrency: string, options: { historyIsRaw?: boolean } = {}): void {
  const { code, minorPerMajor } = quoteCurrencyMajor(rawCurrency);
  bundle.quote.currency = code || "USD";
  if (minorPerMajor !== 1) {
    const quote = bundle.quote;
    quote.price /= minorPerMajor;
    quote.change /= minorPerMajor;
    for (const key of ["postMarketPrice", "postMarketChange", "preMarketPrice", "preMarketChange"] as const) {
      const value = quote[key];
      if (value != null) quote[key] = value / minorPerMajor;
    }
    const scaleBars = (bars: StockAnalysisBundle["historical"]) => bars.map((bar) => ({
      ...bar, close: bar.close / minorPerMajor,
      high: bar.high == null ? bar.high : bar.high / minorPerMajor,
      low: bar.low == null ? bar.low : bar.low / minorPerMajor,
    }));
    if (options.historyIsRaw !== false) bundle.historical = scaleBars(bundle.historical);
    if (bundle.intraday) bundle.intraday = scaleBars(bundle.intraday);
    const investor = bundle.investor;
    for (const key of ["fiftyDayAverage", "twoHundredDayAverage", "fiftyTwoWeekLow", "fiftyTwoWeekHigh", "targetMeanPrice", "targetMedianPrice"] as const) {
      const value = investor[key];
      if (value != null) investor[key] = value / minorPerMajor;
    }
  }
  bundle.investor.currency = code || bundle.investor.currency;
}

/** Convert only with a known FX rate. Missing FX retains the actual listing currency. */
export function stockDisplayMoney(input: {
  amount: number;
  sourceCurrency: string;
  targetCurrency: "USD" | "EUR";
  usdPerUnit?: number | null;
  eurPerUsd?: number | null;
}): { amount: number; currency: string } {
  const source = quoteCurrencyMajor(input.sourceCurrency);
  const amount = input.amount / source.minorPerMajor;
  const code = source.code || "USD";
  if (code === input.targetCurrency) return { amount, currency: code };
  const valid = (rate: number | null | undefined): rate is number => rate != null && Number.isFinite(rate) && rate > 0;
  const usdRate = code === "USD" ? 1 : valid(input.usdPerUnit) ? input.usdPerUnit : code === "EUR" && valid(input.eurPerUsd) ? 1 / input.eurPerUsd : null;
  if (usdRate == null) return { amount, currency: code };
  if (input.targetCurrency === "USD") return { amount: amount * usdRate, currency: "USD" };
  return valid(input.eurPerUsd) ? { amount: amount * usdRate * input.eurPerUsd, currency: "EUR" } : { amount, currency: code };
}
