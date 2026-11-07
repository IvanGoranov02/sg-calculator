import { yahooFinance } from "@/lib/yahooFinanceClient";
import { listedCompanyResults } from "@/lib/companySearch";
import {
  checkRateLimit,
  clientKeyFromRequest,
  rateLimitResponse,
} from "@/lib/rateLimit";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 100) return Response.json({ companies: [] });
  const limited = checkRateLimit(
    "company-search",
    clientKeyFromRequest(request),
    60,
    60_000,
  );
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);
  try {
    const result = await yahooFinance.search(q, {
      quotesCount: 12,
      newsCount: 0,
    });
    return Response.json(
      { companies: listedCompanyResults(result.quotes) },
      { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
    );
  } catch {
    return Response.json(
      { companies: [], error: "Company search is temporarily unavailable." },
      { status: 502 },
    );
  }
}
