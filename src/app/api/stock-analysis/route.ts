import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";

export const dynamic = "force-dynamic";

/** Client-side stock page: same payload as server-side loadStockAnalysis. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get("ticker")?.trim() || "AAPL";
  const { bundle, error } = await loadStockAnalysis(ticker);
  return Response.json({ bundle, error });
}
