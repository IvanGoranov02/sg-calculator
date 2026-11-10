import { DashboardContent } from "@/components/dashboard/DashboardContent";
import type { MarketTile } from "@/components/dashboard/DashboardWidgets";
import { fetchMarketNews, fetchQuickQuote } from "@/lib/yahooQuickQuote";

export const dynamic = "force-dynamic";

const TILES: { key: string; label: string; symbol: string; kind: MarketTile["kind"] }[] = [
  { key: "spy", label: "S&P 500 (SPY)", symbol: "SPY", kind: "usd" },
  { key: "qqq", label: "Nasdaq (QQQ)", symbol: "QQQ", kind: "usd" },
  { key: "dia", label: "Dow (DIA)", symbol: "DIA", kind: "usd" },
  { key: "iwm", label: "Russell 2000", symbol: "IWM", kind: "usd" },
  { key: "vix", label: "VIX", symbol: "^VIX", kind: "num" },
  { key: "tnx", label: "US 10Y", symbol: "^TNX", kind: "pct" },
  { key: "btc", label: "Bitcoin", symbol: "BTC-USD", kind: "usd" },
  { key: "eur", label: "EUR/USD", symbol: "EURUSD=X", kind: "num" },
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
