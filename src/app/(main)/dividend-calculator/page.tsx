import { DividendCalculator } from "@/components/dividend/DividendCalculator";
import { fetchDividendSeed } from "@/lib/yahooDividendSeed";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

export default async function DividendCalculatorPage({ searchParams }: PageProps) {
  const { ticker: raw } = await searchParams;
  const ticker = (raw ?? "KO").trim().toUpperCase() || "KO";
  const seed = await fetchDividendSeed(ticker);

  return <DividendCalculator key={ticker} ticker={ticker} seed={seed} />;
}
