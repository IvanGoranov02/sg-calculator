import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

type TFn = (path: string, vars?: Record<string, string | number>) => string;

export function stockLoadProgressLabel(t: TFn, e: StockAnalysisLoadProgress): string {
  switch (e.kind) {
    case "cache_hit":
      return t("stock.loadProgressCache");
    case "gemini":
      return t("stock.loadProgressGemini", { step: e.step, total: e.total });
    case "yahoo_fundamentals":
      return t("stock.loadProgressYahooFundamentals");
    case "yahoo_prices":
      return t("stock.loadProgressYahooPrices");
  }
}
