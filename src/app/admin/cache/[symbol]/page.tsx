import { CacheEditorClient } from "@/components/admin/CacheEditorClient";
import { isValidStockSymbolInput, normalizeStockSymbol } from "@/lib/stockSymbol";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ symbol: string }> };

export default async function AdminCacheEditPage({ params }: Props) {
  const raw = decodeURIComponent((await params).symbol).trim();
  if (!isValidStockSymbolInput(raw)) notFound();
  const symbol = normalizeStockSymbol(raw);
  return <CacheEditorClient symbol={symbol} />;
}
