"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import usCompanies from "@/data/usCompanies.json";

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

type CompanyEntry = { s: string; n: string };

const COMPANIES = usCompanies as CompanyEntry[];
const MAX_SUGGESTIONS = 8;

/** Ticker prefix matches first (exact ticker on top), then company-name substring matches. */
function suggestCompanies(query: string): CompanyEntry[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const byTicker: CompanyEntry[] = [];
  const byName: CompanyEntry[] = [];
  for (const c of COMPANIES) {
    if (c.s.startsWith(q)) byTicker.push(c);
    else if (c.n.toUpperCase().includes(q)) byName.push(c);
    if (byTicker.length >= MAX_SUGGESTIONS) break;
  }
  return [...byTicker, ...byName].slice(0, MAX_SUGGESTIONS);
}

function StockSearch({ isDcf }: StockSearchProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromPath = pathname.match(/^\/stock\/([^/]+)/i)?.[1]?.trim().toUpperCase() ?? "";
  const fromUrl = searchParams.get("ticker")?.trim() ?? "";
  const [query, setQuery] = useState(() => fromPath || fromUrl || "AAPL");
  const [symbolError, setSymbolError] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const suggestions = useMemo(() => (open ? suggestCompanies(query) : []), [open, query]);

  function go(rawSym: string) {
    const sym = rawSym.trim().toUpperCase();
    if (!sym) return;
    if (!isValidStockSymbolInput(sym)) {
      setSymbolError(true);
      return;
    }
    setSymbolError(false);
    setOpen(false);
    setHighlighted(-1);
    setQuery(sym);
    if (isDcf) {
      router.push(`/dcf-calculator?ticker=${encodeURIComponent(sym)}`);
    } else {
      router.push(`/stock/${encodeURIComponent(sym)}`);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (highlighted >= 0 && highlighted < suggestions.length) {
      go(suggestions[highlighted].s);
      return;
    }
    go(query);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="relative flex w-full max-w-xl flex-col gap-2 rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 shadow-inner shadow-black/20 backdrop-blur-sm transition-colors focus-within:border-emerald-500/30 focus-within:ring-1 focus-within:ring-emerald-500/20 sm:flex-row sm:items-center sm:gap-2 sm:py-1.5"
    >
      <div className="flex min-h-10 min-w-0 flex-1 items-center gap-2">
        <Search className="size-4 shrink-0 text-zinc-500" aria-hidden />
        <Input
          name="ticker"
          value={query}
          onChange={(e) => {
            setSymbolError(false);
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so suggestion onMouseDown can run before the list unmounts.
            setTimeout(() => {
              setOpen(false);
              setHighlighted(-1);
            }, 100);
          }}
          onKeyDown={(e) => {
            if (suggestions.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlighted((h) => (h + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
            } else if (e.key === "Escape") {
              setOpen(false);
              setHighlighted(-1);
            }
          }}
          placeholder={t("search.placeholder")}
          className="min-h-9 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0 sm:h-8 sm:text-sm"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
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
      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-zinc-900/95 py-1 shadow-lg shadow-black/40 backdrop-blur-sm"
        >
          {suggestions.map((c, i) => (
            <li key={c.s} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm ${
                  i === highlighted ? "bg-emerald-500/15 text-emerald-300" : "hover:bg-white/5"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(c.s);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <span className="font-mono font-medium">{c.s}</span>
                <span className="truncate text-xs text-muted-foreground">{c.n}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {symbolError ? (
        <p className="w-full text-xs text-red-400" role="alert">
          {t("errors.invalidTickerSymbol")}
        </p>
      ) : null}
    </form>
  );
}
