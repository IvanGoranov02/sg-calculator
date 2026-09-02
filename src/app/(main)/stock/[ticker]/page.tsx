import { StockAnalysisPageClient } from "@/components/stock/StockAnalysisPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function StockTickerPage({ params }: PageProps) {
  const { ticker: raw } = await params;
  let ticker = (raw ?? "").trim() || "AAPL";
  try {
    ticker = decodeURIComponent(ticker).trim() || "AAPL";
  } catch {
    /* keep raw */
  }

  return <StockAnalysisPageClient ticker={ticker} />;
}
