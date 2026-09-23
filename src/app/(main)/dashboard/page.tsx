import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { fetchMarketNews, fetchQuickQuote } from "@/lib/yahooQuickQuote";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [spy, qqq, oil, brent, gold, silver, oilNews] = await Promise.all([
    fetchQuickQuote("SPY"),
    fetchQuickQuote("QQQ"),
    fetchQuickQuote("CL=F"),
    fetchQuickQuote("BZ=F"),
    fetchQuickQuote("GC=F"),
    fetchQuickQuote("SI=F"),
    fetchMarketNews("crude oil futures market", 3),
  ]);

  return (
    <DashboardContent
      market={{ spy, qqq, oil }}
      commodities={{ oil, brent, gold, silver }}
      oilNews={oilNews}
    />
  );
}
