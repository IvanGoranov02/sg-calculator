import { CompareClient } from "@/components/compare/CompareClient";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ symbols?: string }> };

export default async function ComparePage({ searchParams }: PageProps) {
  const { symbols } = await searchParams;
  const initial = (symbols ?? "AAPL,MSFT,GOOGL")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 4);
  return <CompareClient initialSymbols={initial} />;
}
