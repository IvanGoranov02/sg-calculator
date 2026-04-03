import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

/** Legacy `/stock-analysis?ticker=` → canonical `/stock/[ticker]`. */
export default async function StockAnalysisPage({ searchParams }: PageProps) {
  const { ticker = "AAPL" } = await searchParams;
  const sym = ticker.trim() || "AAPL";
  redirect(`/stock/${encodeURIComponent(sym)}`);
}
