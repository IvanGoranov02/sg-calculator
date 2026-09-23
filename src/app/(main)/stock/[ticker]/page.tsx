import { redirect } from "next/navigation";

import { StockAnalysisPageClient } from "@/components/stock/StockAnalysisPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export default async function StockTickerPage({ params }: PageProps) {
  const { ticker: raw } = await params;
  let ticker = (raw ?? "").trim();
  try {
    ticker = decodeURIComponent(ticker).trim();
  } catch {
    /* keep raw */
  }

  if (!ticker) redirect("/stock");

  return <StockAnalysisPageClient ticker={ticker} />;
}
