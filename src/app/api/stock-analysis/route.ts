import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";
import { INVALID_TICKER_SYMBOL_MESSAGE, isValidStockSymbolInput } from "@/lib/stockSymbol";

export const dynamic = "force-dynamic";

type NdjsonLine =
  | { type: "progress"; payload: StockAnalysisLoadProgress }
  | { type: "done"; bundle: unknown; error: string | null };

/** Client-side stock page: JSON, or NDJSON stream when `stream=1` (progress + final bundle). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim() || "AAPL";
  const forceRefresh = searchParams.get("refresh") === "1";
  const stream = searchParams.get("stream") === "1";

  if (!isValidStockSymbolInput(ticker)) {
    return Response.json({ bundle: null, error: INVALID_TICKER_SYMBOL_MESSAGE }, { status: 400 });
  }

  if (!stream) {
    const { bundle, error } = await loadStockAnalysis(ticker, { forceRefresh });
    return Response.json({ bundle, error });
  }

  const encoder = new TextEncoder();
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: NdjsonLine) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      };
      try {
        const result = await loadStockAnalysis(ticker, {
          forceRefresh,
          onProgress: (payload) => send({ type: "progress", payload }),
        });
        send({ type: "done", bundle: result.bundle, error: result.error });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load stock data.";
        send({ type: "done", bundle: null, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
