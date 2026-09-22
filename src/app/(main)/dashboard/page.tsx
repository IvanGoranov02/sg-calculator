import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { fetchMarketNews, fetchSparkQuote } from "@/lib/yahooQuickQuote";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [spy, qqq, gold, silver, oil, marketNews] = await Promise.all([
    fetchSparkQuote("SPY"),
    fetchSparkQuote("QQQ"),
    fetchSparkQuote("GC=F"),
    fetchSparkQuote("SI=F"),
    fetchSparkQuote("CL=F"),
    fetchMarketNews("S&P 500", 5),
  ]);

  return (
    <DashboardContent
      benchmarks={{ spy, qqq, gold, silver, oil }}
      marketNews={marketNews}
    />
  );
}
