import { DividendCalculator } from "@/components/dividend/DividendCalculator";
import { fetchDividendSeed } from "@/lib/yahooDividendSeed";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

export default async function DividendCalculatorPage({ searchParams }: PageProps) {
  const { ticker: raw } = await searchParams;
  const ticker = raw?.trim().toUpperCase() ?? "";
  const seed = ticker ? await fetchDividendSeed(ticker) : null;

  return <DividendCalculator key={ticker || "empty"} seed={seed} />;
}
