/** Emitted during stock analysis load (Gemini + Yahoo) for progress UI. */
export type StockAnalysisLoadProgress =
  | { kind: "cache_hit" }
  | { kind: "gemini"; step: 1 | 2 | 3; total: 3 }
  | { kind: "yahoo_fundamentals" }
  | { kind: "yahoo_prices" };

/** Client-only state for the loading bar (NDJSON stream). */
export type StockAnalysisPageLoadProgress = {
  event: StockAnalysisLoadProgress | null;
  percent: number;
  connecting: boolean;
};

/** Map last progress event to ~0–99%; client sets 100% when the stream sends `done`. */
export function stockLoadProgressPercent(e: StockAnalysisLoadProgress): number {
  switch (e.kind) {
    case "cache_hit":
      return 18;
    case "gemini":
      return Math.min(99, Math.round((e.step / e.total) * 52) + 12);
    case "yahoo_fundamentals":
      return 74;
    case "yahoo_prices":
      return 92;
    default:
      return 0;
  }
}
