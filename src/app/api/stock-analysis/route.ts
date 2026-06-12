import { auth } from "@/auth";
import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";
import { INVALID_TICKER_SYMBOL_MESSAGE, isValidStockSymbolInput } from "@/lib/stockSymbol";

export const dynamic = "force-dynamic";

/** Per client: page loads (Yahoo + possible Gemini fetch behind them). */
const LOAD_LIMIT = 20;
const LOAD_WINDOW_MS = 60_000;
/** Per signed-in user: full Gemini re-fetches via the refresh button. */
const REFRESH_LIMIT = 3;
const REFRESH_WINDOW_MS = 10 * 60_000;

type NdjsonLine =
  | { type: "progress"; payload: StockAnalysisLoadProgress }
  | { type: "done"; bundle: unknown; error: string | null };

/** Client-side stock page: JSON, or NDJSON stream when `stream=1` (progress + final bundle). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim() || "AAPL";
  let forceRefresh = searchParams.get("refresh") === "1";
  const stream = searchParams.get("stream") === "1";

  if (!isValidStockSymbolInput(ticker)) {
    return Response.json({ bundle: null, error: INVALID_TICKER_SYMBOL_MESSAGE }, { status: 400 });
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;
  const clientKey = clientKeyFromRequest(request, userId);

  const general = checkRateLimit("stock-analysis", clientKey, LOAD_LIMIT, LOAD_WINDOW_MS);
  if (!general.ok) {
    return rateLimitResponse(general.retryAfterSec);
  }

  if (forceRefresh) {
    if (!userId) {
      // Anonymous clients cannot trigger paid full re-fetches; serve the normal path.
      forceRefresh = false;
    } else {
      const refresh = checkRateLimit("stock-refresh", clientKey, REFRESH_LIMIT, REFRESH_WINDOW_MS);
      if (!refresh.ok) {
        return rateLimitResponse(refresh.retryAfterSec);
      }
    }
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
