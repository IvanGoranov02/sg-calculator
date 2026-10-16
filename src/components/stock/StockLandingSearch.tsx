"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useId, useMemo, useRef, useState } from "react";

import { WatchlistToggle } from "@/components/watchlist/WatchlistToggle";
import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { pushRecentStockSearch } from "@/lib/stockRecentSearches";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { resolveStockSearchQuery, suggestCompanies, type SearchCompany } from "@/lib/stockSearch";
import { INSTANT_COMPANIES, loadStockCompanyIndex } from "@/lib/stockCompanyIndex";

type CompanyEntry = SearchCompany;

type StockLandingSearchProps = {
  /** Handle selection without navigating (for adding a watchlist company). */
  onSelectSymbol?: (symbol: string) => void;
  placeholder?: string;
  submitLabel?: string;
  disabled?: boolean;
  /** Where a chosen symbol opens. Defaults to the stock analysis page. */
  hrefForSymbol?: (symbol: string) => string;
};

/** Prominent company search (Stock Analysis landing, and other empty states). */
export function StockLandingSearch({ hrefForSymbol, onSelectSymbol, placeholder, submitLabel, disabled }: StockLandingSearchProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [symbolError, setSymbolError] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [companies, setCompanies] = useState<CompanyEntry[]>(INSTANT_COMPANIES);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    let active = true;
    void loadStockCompanyIndex().then((list) => {
      if (active && list.length > INSTANT_COMPANIES.length) setCompanies(list);
    });
    return () => {
      active = false;
    };
  }, [open]);

  const suggestionPool = useMemo(() => suggestCompanies(companies, query), [query, companies]);
  const suggestions = open ? suggestionPool : [];

  useEffect(() => {
    if (open && highlighted >= 0) {
      document.getElementById(`${listId}-${highlighted}`)?.scrollIntoView({ block: "nearest" });
    }
  }, [highlighted, listId, open]);

  function go(rawSym: string, name?: string) {
    const sym = rawSym.trim().toUpperCase();
    if (!sym || !isValidStockSymbolInput(sym)) {
      setSymbolError(true);
      return;
    }
    setSymbolError(false);
    setOpen(false);
    setHighlighted(-1);
    if (onSelectSymbol) {
      if (!disabled) onSelectSymbol(sym);
      setQuery("");
      return;
    }
    pushRecentStockSearch(sym, name);
    const href = hrefForSymbol
      ? hrefForSymbol(sym)
      : `/stock/${encodeURIComponent(sym)}`;
    router.push(href);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (highlighted >= 0 && highlighted < suggestionPool.length) {
      const pick = suggestionPool[highlighted];
      go(pick.s, pick.n);
      return;
    }
    const resolved = resolveStockSearchQuery(query, suggestionPool, companies);
    if (!resolved) {
      setSymbolError(true);
      return;
    }
    const match = companies.find((c) => c.s === resolved);
    go(resolved, match?.n);
  }

  return (
    <form
      onSubmit={onSubmit}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          setHighlighted(-1);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          setHighlighted(-1);
        }
      }}
      className="relative rounded-xl border border-border bg-card px-3 py-2 shadow-inner shadow-sm focus-within:border-emerald-500/30 focus-within:ring-1 focus-within:ring-emerald-500/20"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Search className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          name="ticker"
          value={query}
          onChange={(e) => {
            setSymbolError(false);
            setQuery(e.target.value.toUpperCase());
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (suggestionPool.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setHighlighted((h) => (h + 1) % suggestionPool.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              setHighlighted((h) => (h <= 0 ? suggestionPool.length - 1 : h - 1));
            }
          }}
          placeholder={placeholder ?? t("search.placeholder")}
          aria-label={submitLabel ?? t("search.submit")}
          disabled={disabled}
          className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
          aria-controls={open && suggestions.length > 0 ? listId : undefined}
          aria-activedescendant={open && highlighted >= 0 && highlighted < suggestions.length ? `${listId}-${highlighted}` : undefined}
        />
        <Button disabled={disabled} type="submit" size="sm" variant="secondary" className="shrink-0">
          {submitLabel ?? t("search.submit")}
        </Button>
      </div>
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={submitLabel ?? t("search.submit")}
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg backdrop-blur-sm"
        >
          {suggestions.map((c, i) => (
            <li key={c.s} id={`${listId}-${i}`} role="option" aria-selected={i === highlighted} className="flex items-center gap-1 pr-2">
              <button
                type="button"
                className={`flex min-w-0 flex-1 px-3 py-2 text-left text-sm ${
                  i === highlighted ? "bg-emerald-500/15 text-emerald-300" : "hover:bg-muted/50"
                }`}
                onClick={() => go(c.s, c.n)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(i)}
              >
                <CompanyIdentity symbol={c.s} name={c.n} size="sm" />
              </button>
              {!onSelectSymbol && <WatchlistToggle symbol={c.s} compact />}
            </li>
          ))}
        </ul>
      ) : null}
      {symbolError ? (
        <p className="mt-2 text-xs text-red-400" role="alert">
          {t("errors.invalidTickerSymbol")}
        </p>
      ) : null}
    </form>
  );
}
