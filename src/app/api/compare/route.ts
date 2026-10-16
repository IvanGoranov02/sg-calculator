import { NextResponse } from "next/server";

import { parseCompareSymbols } from "@/lib/compareMetrics";
import { checkRateLimit, clientKeyFromRequest, rateLimitResponse } from "@/lib/rateLimit";
import { fetchCompareRows } from "@/lib/yahooCompare";
import { createSharedRequestCache, RequestCapacityError } from "@/lib/sharedRequestCache";
import { isTimeoutError } from "@/lib/asyncTimeout";
import type { CompareRow } from "@/lib/yahooCompare";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
const loadRows = createSharedRequestCache<CompareRow[]>({ ttlMs: 60_000, timeoutMs: 20_000 });

export async function GET(request: Request) {
  const key = clientKeyFromRequest(request);
  const limited = checkRateLimit("compare", key, 30, 60_000);
  if (!limited.ok) return rateLimitResponse(limited.retryAfterSec);

  const { searchParams } = new URL(request.url);
  const symbols = parseCompareSymbols(searchParams.get("symbols"));

  if (symbols.length === 0) return NextResponse.json({ rows: [] });
  try {
    const rows = await loadRows(symbols.join(","), () => fetchCompareRows(symbols));
    return NextResponse.json({ rows });
  } catch (error) {
    const status = error instanceof RequestCapacityError ? 503 : isTimeoutError(error) ? 504 : 502;
    return NextResponse.json({ error: "Could not load comparison. Try again." }, { status });
  }
}
