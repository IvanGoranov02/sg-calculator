"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type StockSearchProps = {
  /** When not on stock analysis, navigate here with ?ticker= */
  actionPath?: string;
};

/** Remount when the query string changes so the input stays in sync with the URL. */
export function StockSearchContainer({ actionPath }: { actionPath?: string }) {
  const searchParams = useSearchParams();
  return <StockSearch key={searchParams.toString()} actionPath={actionPath} />;
}

/** Uses the current route so search submits to stock analysis or DCF as appropriate. */
export function StockSearchWithRoute() {
  const pathname = usePathname();
  const actionPath = pathname.startsWith("/dcf-calculator")
    ? "/dcf-calculator"
    : "/stock-analysis";
  return <StockSearchContainer actionPath={actionPath} />;
}

function StockSearch({ actionPath = "/stock-analysis" }: StockSearchProps) {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("ticker")?.trim() ?? "";
  const [query, setQuery] = useState(() => fromUrl || "AAPL");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const t = query.trim().toUpperCase();
    if (!t) return;
    router.push(`${actionPath}?ticker=${encodeURIComponent(t)}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-1.5 shadow-inner shadow-black/20 backdrop-blur-sm transition-colors focus-within:border-emerald-500/30 focus-within:ring-1 focus-within:ring-emerald-500/20"
    >
      <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
      <Input
        name="ticker"
        value={query}
        onChange={(e) => setQuery(e.target.value.toUpperCase())}
        placeholder={t("search.placeholder")}
        className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        autoComplete="off"
        spellCheck={false}
      />
      <Button type="submit" size="sm" variant="secondary" className="shrink-0">
        {t("search.submit")}
      </Button>
    </form>
  );
}
