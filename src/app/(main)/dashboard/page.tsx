import type { Metadata } from "next";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import type { MarketTile } from "@/components/dashboard/DashboardWidgets";
import { fetchMarketNews, fetchQuickQuote } from "@/lib/yahooQuickQuote";

export const metadata: Metadata = { title: "Dashboard" };

export const dynamic = "force-dynamic";

const TILES: { key: string; label: string; symbol: string; kind: MarketTile["kind"] }[] = [
  { key: "spy", label: "S&P 500", symbol: "SPY", kind: "usd" },
  { key: "btc", label: "Bitcoin", symbol: "BTC-USD", kind: "usd" },
  { key: "wti", label: "Oil WTI", symbol: "CL=F", kind: "usd" },
  { key: "brent", label: "Brent", symbol: "BZ=F", kind: "usd" },
  { key: "gold", label: "Gold", symbol: "GC=F", kind: "usd" },
  { key: "silver", label: "Silver", symbol: "SI=F", kind: "usd" },
];

export default async function DashboardPage() {
  const [quotes, news] = await Promise.all([
    Promise.all(TILES.map((t) => fetchQuickQuote(t.symbol))),
    fetchMarketNews("stock market today", 6),
  ]);
  const tiles: MarketTile[] = TILES.map((t, i) => ({ key: t.key, label: t.label, kind: t.kind, quote: quotes[i] }));
  return <DashboardContent tiles={tiles} news={news} />;
}
