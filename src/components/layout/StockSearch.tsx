"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";

/** Remount when the synced ticker changes so the input matches the URL without effects. */
export function StockSearchContainer({ isDcf }: { isDcf: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathTicker = pathname.match(/^\/stock\/([^/]+)/i)?.[1] ?? "";
  const dcfTicker = searchParams.get("ticker") ?? "";
  const syncKey = isDcf ? `dcf-${dcfTicker}-${searchParams.toString()}` : `stock-${pathTicker}`;
  return <StockSearch key={syncKey} isDcf={isDcf} />;
}

/** Uses DCF vs stock ticker route from the current path. */
export function StockSearchWithRoute() {
  const pathname = usePathname();
  const isDcf = pathname.startsWith("/dcf-calculator");
  return <StockSearchContainer isDcf={isDcf} />;
}

type StockSearchProps = {
  isDcf: boolean;
};

function StockSearch({ isDcf }: StockSearchProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromPath = pathname.match(/^\/stock\/([^/]+)/i)?.[1]?.trim().toUpperCase() ?? "";
  const fromUrl = searchParams.get("ticker")?.trim() ?? "";
  const [query, setQuery] = useState(() => fromPath || fromUrl || "AAPL");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const sym = query.trim().toUpperCase();
    if (!sym) return;
    if (isDcf) {
      router.push(`/dcf-calculator?ticker=${encodeURIComponent(sym)}`);
    } else {
      router.push(`/stock/${encodeURIComponent(sym)}`);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-xl flex-col gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 shadow-inner shadow-black/20 backdrop-blur-sm transition-colors focus-within:border-emerald-500/30 focus-within:ring-1 focus-within:ring-emerald-500/20 sm:flex-row sm:items-center sm:gap-2 sm:py-1.5"
    >
      <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2">
        <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
        <Input
          name="ticker"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          placeholder={t("search.placeholder")}
          className="min-h-9 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 sm:h-8 sm:text-sm"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
        />
      </div>
      <Button
        type="submit"
        size="sm"
        variant="secondary"
        className="h-10 w-full shrink-0 sm:h-8 sm:w-auto"
      >
        {t("search.submit")}
      </Button>
    </form>
  );
}
