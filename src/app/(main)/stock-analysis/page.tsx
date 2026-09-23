import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ ticker?: string }>;
};

/** Legacy `/stock-analysis?ticker=` → canonical `/stock` or `/stock/[ticker]`. */
export default async function StockAnalysisPage({ searchParams }: PageProps) {
  const { ticker } = await searchParams;
  const sym = (ticker ?? "").trim();
  if (sym) redirect(`/stock/${encodeURIComponent(sym)}`);
  redirect("/stock");
}
