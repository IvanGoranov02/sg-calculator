import type { Metadata } from "next";
import { DcfCalculator } from "@/components/dcf/DcfCalculator";
import { fetchDcfSeed } from "@/lib/yahooDcfSeed";

export const metadata: Metadata = { title: "DCF Calculator" };

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

export default async function DcfCalculatorPage({ searchParams }: PageProps) {
  const { ticker: raw } = await searchParams;
  const ticker = raw?.trim().toUpperCase() ?? "";
  const seed = ticker ? await fetchDcfSeed(ticker) : null;

  return <DcfCalculator key={ticker || "empty"} ticker={ticker} seed={seed} />;
}
