import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { StockAnalysisPageClient } from "@/components/stock/StockAnalysisPageClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ ticker: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ticker } = await params;
  let sym = ticker ?? "";
  try {
    sym = decodeURIComponent(sym);
  } catch {
    /* keep raw */
  }
  return { title: sym.trim().toUpperCase() || "Stock Analysis" };
}

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
