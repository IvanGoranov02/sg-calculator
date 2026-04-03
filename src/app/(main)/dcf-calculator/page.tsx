import { DcfCalculator } from "@/components/dcf/DcfCalculator";
import { fetchDcfSeed } from "@/lib/yahooDcfSeed";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

export default async function DcfCalculatorPage({ searchParams }: PageProps) {
  const { ticker: raw } = await searchParams;
  const ticker = (raw ?? "AAPL").trim().toUpperCase() || "AAPL";
  const seed = await fetchDcfSeed(ticker);

  return <DcfCalculator key={ticker} ticker={ticker} seed={seed} />;
}
