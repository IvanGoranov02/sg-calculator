import { auth } from "@/auth";
import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";
import { INVALID_TICKER_SYMBOL_MESSAGE, isValidStockSymbolInput } from "@/lib/stockSymbol";
import { createStockAnalysisJobs, stockAnalysisStreamResponse } from "@/lib/stockAnalysisRequest";
import { RequestCapacityError } from "@/lib/sharedRequestCache";
import { withTimeout } from "@/lib/asyncTimeout";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Per client: page loads (Yahoo + possible Gemini fetch behind them). */
const LOAD_LIMIT = 20;
const LOAD_WINDOW_MS = 60_000;
/** Per signed-in user: full Gemini re-fetches via the refresh button. */
const REFRESH_LIMIT = 3;
const REFRESH_WINDOW_MS = 10 * 60_000;

const stockJobs = createStockAnalysisJobs(loadStockAnalysis);

/** Client-side stock page: JSON, or NDJSON stream when `stream=1` (progress + final bundle). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim() || "AAPL";
  let forceRefresh = searchParams.get("refresh") === "1";
  const stream = searchParams.get("stream") === "1";

  if (!isValidStockSymbolInput(ticker)) {
    return Response.json({ bundle: null, error: INVALID_TICKER_SYMBOL_MESSAGE }, { status: 400 });
  }

  // Session is only required to authorize a paid full re-fetch. Skip Prisma/auth
  // on the anonymous hot path so a pooler hang cannot stall the NDJSON stream.
  if (forceRefresh) {
    let session;
    try {
      // Keep the auth check plus the 110-second shared load inside this route's
      // 120-second ceiling; an unverified session never starts a forced fetch.
      session = await withTimeout(auth(), 8_000, "Stock sign-in check");
    } catch {
      return Response.json({ bundle: null, error: "Could not load stock data." }, { status: 503 });
    }
    const userId = session?.user?.id ?? null;
    if (!userId) {
      forceRefresh = false;
    } else {
      const clientKey = clientKeyFromRequest(request, userId);
      const refresh = checkRateLimit("stock-refresh", clientKey, REFRESH_LIMIT, REFRESH_WINDOW_MS);
      if (!refresh.ok) {
        return rateLimitResponse(refresh.retryAfterSec);
      }
    }
  }

  const clientKey = clientKeyFromRequest(request);
  const general = checkRateLimit("stock-analysis", clientKey, LOAD_LIMIT, LOAD_WINDOW_MS);
  if (!general.ok) {
    return rateLimitResponse(general.retryAfterSec);
  }

  try {
    const job = stockJobs(ticker, forceRefresh);
    if (!stream) return Response.json(await job.result);
    return stockAnalysisStreamResponse(job, request.signal);
  } catch (error) {
    if (error instanceof RequestCapacityError) return Response.json({ bundle: null, error: error.message }, { status: 503 });
    throw error;
  }
}
