import { Loader2 } from "lucide-react";

export default function StockTickerLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
      <Loader2 className="size-8 animate-spin text-emerald-500/80" aria-hidden />
      <p className="text-sm">Loading stock…</p>
    </div>
  );
}
