import { StockAnalysisView } from "@/components/stock/StockAnalysisView";
import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function StockTickerPage({ params }: PageProps) {
  const { ticker: raw } = await params;
  const ticker = raw?.trim() || "AAPL";
  const { bundle, error } = await loadStockAnalysis(ticker);

  return <StockAnalysisView ticker={ticker} bundle={bundle} error={error} />;
}
