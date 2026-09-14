import { CompareClient } from "@/components/compare/CompareClient";
import { initialCompareSymbols } from "@/lib/compareMetrics";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ symbols?: string }> };

export default async function ComparePage({ searchParams }: PageProps) {
  const { symbols } = await searchParams;
  return <CompareClient initialSymbols={initialCompareSymbols(symbols)} />;
}
