import type { Metadata } from "next";
import { CompareClient } from "@/components/compare/CompareClient";
import { initialCompareSlots } from "@/lib/compareMetrics";

export const metadata: Metadata = { title: "Compare" };

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ symbols?: string }> };

export default async function ComparePage({ searchParams }: PageProps) {
  const { symbols } = await searchParams;
  return <CompareClient initialSlots={initialCompareSlots(symbols)} />;
}
