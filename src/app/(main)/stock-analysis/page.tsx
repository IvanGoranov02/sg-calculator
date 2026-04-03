import { StockAnalysisView } from "@/components/stock/StockAnalysisView";
import { loadStockAnalysis } from "@/lib/stockAnalysisLoader";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

export default async function StockAnalysisPage({ searchParams }: PageProps) {
  const { ticker = "AAPL" } = await searchParams;
  const { bundle, error } = await loadStockAnalysis(ticker);

  return <StockAnalysisView ticker={ticker} bundle={bundle} error={error} />;
}
