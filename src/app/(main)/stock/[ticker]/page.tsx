import { StockAnalysisPageClient } from "@/components/stock/StockAnalysisPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function StockTickerPage({ params }: PageProps) {
  const { ticker: raw } = await params;
  const ticker = raw?.trim() || "AAPL";

  return <StockAnalysisPageClient ticker={ticker} />;
}
