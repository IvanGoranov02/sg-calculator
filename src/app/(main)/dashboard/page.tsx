import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { fetchQuickQuote } from "@/lib/yahooQuickQuote";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [spy, qqq] = await Promise.all([fetchQuickQuote("SPY"), fetchQuickQuote("QQQ")]);

  return <DashboardContent market={{ spy, qqq }} />;
}
