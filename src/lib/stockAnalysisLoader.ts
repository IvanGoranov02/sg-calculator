import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { fetchStockAnalysisFromYahoo } from "@/lib/yahooStockData";

export type StockAnalysisResult = {
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

/** Load market data via yahoo-finance2 (server-side, no API keys). */
export async function loadStockAnalysis(symbol: string): Promise<StockAnalysisResult> {
  const sym = symbol.trim().toUpperCase() || "AAPL";

  try {
    const bundle = await fetchStockAnalysisFromYahoo(sym);
    return { bundle, error: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Could not load stock data.";
    return { bundle: null, error: message };
  }
}
