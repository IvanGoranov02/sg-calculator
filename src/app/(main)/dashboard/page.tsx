import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { MarketStrip, NewsWidget, type MarketTile } from "@/components/dashboard/DashboardWidgets";
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

async function MarketTiles() {
  const quotes = await Promise.all(TILES.map((t) => fetchQuickQuote(t.symbol)));
  const tiles: MarketTile[] = TILES.map((t, i) => ({ key: t.key, label: t.label, kind: t.kind, quote: quotes[i] }));
  return <MarketStrip tiles={tiles} />;
}

async function NewsBlock() {
  const news = await fetchMarketNews("stock market today", 6);
  return <NewsWidget items={news} />;
}

function TilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6" aria-hidden>
      {TILES.map((t) => (
        <div key={t.key} className="h-[4.75rem] animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}

function NewsSkeleton() {
  return <div className="h-40 animate-pulse rounded-xl border border-border bg-card" aria-hidden />;
}

/** The page shell paints at once; market quotes and news stream in when Yahoo answers. */
export default function DashboardPage() {
  return (
    <DashboardContent
      marketSlot={
        <Suspense fallback={<TilesSkeleton />}>
          <MarketTiles />
        </Suspense>
      }
      newsSlot={
        <Suspense fallback={<NewsSkeleton />}>
          <NewsBlock />
        </Suspense>
      }
    />
  );
}
