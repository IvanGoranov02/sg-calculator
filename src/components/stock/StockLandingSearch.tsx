"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { pushRecentStockSearch } from "@/lib/stockRecentSearches";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { resolveStockSearchQuery, suggestCompanies, type SearchCompany } from "@/lib/stockSearch";
import usCompanies from "@/data/usCompanies.json";

type CompanyEntry = SearchCompany;

const INSTANT_COMPANIES = usCompanies as CompanyEntry[];

let fullCompaniesPromise: Promise<CompanyEntry[]> | null = null;
function loadFullCompanies(): Promise<CompanyEntry[]> {
  if (!fullCompaniesPromise) {
    fullCompaniesPromise = fetch("/us-companies.json")
      .then((r) => (r.ok ? (r.json() as Promise<CompanyEntry[]>) : INSTANT_COMPANIES))
      .catch(() => INSTANT_COMPANIES);
  }
  return fullCompaniesPromise;
}

/** Prominent search on the Stock Analysis landing page. */
export function StockLandingSearch() {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [symbolError, setSymbolError] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [companies, setCompanies] = useState<CompanyEntry[]>(INSTANT_COMPANIES);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void loadFullCompanies().then((list) => {
      if (active && list.length > INSTANT_COMPANIES.length) setCompanies(list);
    });
    return () => {
      active = false;
    };
  }, []);

  const suggestionPool = useMemo(() => suggestCompanies(companies, query), [query, companies]);
  const suggestions = open ? suggestionPool : [];

  function go(rawSym: string, name?: string) {
    const sym = rawSym.trim().toUpperCase();
    if (!sym || !isValidStockSymbolInput(sym)) {
      setSymbolError(true);
      return;
    }
    setSymbolError(false);
    setOpen(false);
    setHighlighted(-1);
    pushRecentStockSearch(sym, name);
    router.push(`/stock/${encodeURIComponent(sym)}`);
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
          onBlur={() => {
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
          className="h-11 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
          autoComplete="off"
          spellCheck={false}
          inputMode="text"
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
        />
        <Button type="submit" size="sm" variant="secondary" className="shrink-0">
          {t("search.submit")}
        </Button>
      </div>
      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-lg backdrop-blur-sm"
        >
          {suggestions.map((c, i) => (
            <li key={c.s} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                className={`flex w-full px-3 py-2 text-left text-sm ${
                  i === highlighted ? "bg-emerald-500/15 text-emerald-300" : "hover:bg-muted/50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(c.s, c.n);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                <CompanyIdentity symbol={c.s} name={c.n} size="sm" />
              </button>
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
