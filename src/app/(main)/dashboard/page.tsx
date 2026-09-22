import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { fetchMarketNews, fetchQuickQuote } from "@/lib/yahooQuickQuote";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [spy, qqq, gold, silver, oil, marketNews] = await Promise.all([
    fetchQuickQuote("SPY"),
    fetchQuickQuote("QQQ"),
    fetchQuickQuote("GC=F"),
    fetchQuickQuote("SI=F"),
    fetchQuickQuote("CL=F"),
    fetchMarketNews("US stock market economy", 9),
  ]);

  return (
    <DashboardContent
      benchmarks={{ spy, qqq, gold, silver, oil }}
      marketNews={marketNews}
    />
  );
}
