"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { INSTANT_COMPANIES, loadFullCompanies } from "@/components/layout/StockSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { resolveStockSearchQuery, type SearchCompany } from "@/lib/stockSearch";
import { useCompanySearch } from "@/lib/useCompanySearch";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";

type Props = {
  /** Adds a ticker to the watchlist. */
  onAdd: (symbol: string) => unknown;
  disabled?: boolean;
};

/** Company-name search (same index/logic as the global search) that adds the pick to the watchlist. */
export function WatchlistAddSearch({ onAdd, disabled }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [invalid, setInvalid] = useState(false);
  const [companies, setCompanies] = useState<SearchCompany[]>(INSTANT_COMPANIES);
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

  const pool = useCompanySearch(companies, query);
  const suggestions = open ? pool : [];

  async function pick(rawSymbol: string) {
    const sym = rawSymbol.trim().toUpperCase();
    if (!sym) return;
    if (!isValidStockSymbolInput(sym)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setOpen(false);
    setHighlighted(-1);
    setQuery("");
    await Promise.resolve(onAdd(sym));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    if (highlighted >= 0 && highlighted < pool.length) {
      void pick(pool[highlighted].s);
      return;
    }
    const resolved = resolveStockSearchQuery(query, pool, companies);
    if (!resolved) {
      setInvalid(true);
      return;
    }
    void pick(resolved);
  }

  return (
    <form onSubmit={onSubmit} className="flex min-w-0 flex-1 items-end gap-2">
      <div className="relative min-w-0 flex-1">
        <label htmlFor="wl-add" className="mb-1 block text-xs font-medium text-muted-foreground">
          {t("watchlist.addLabel")}
        </label>
        <Input
          id="wl-add"
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setInvalid(false);
            setQuery(e.target.value);
            setOpen(true);
            setHighlighted(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Delay so a suggestion's onMouseDown can run before the list unmounts.
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
          maxLength={64}
          autoComplete="off"
          spellCheck={false}
          role="combobox"
          aria-expanded={open && suggestions.length > 0}
          aria-autocomplete="list"
          disabled={disabled}
        />
        {open && suggestions.length > 0 ? (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 max-h-60 overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover py-1 shadow-lg"
          >
            {suggestions.map((c, i) => (
              <li key={c.s} role="option" aria-selected={i === highlighted}>
                <button
                  type="button"
                  className={`flex w-full px-3 py-1.5 text-left text-sm ${
                    i === highlighted ? "bg-emerald-500/15 text-emerald-300" : "hover:bg-muted/50"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void pick(c.s);
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                >
                  <CompanyIdentity symbol={c.s} name={c.n} size="sm" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {invalid ? (
          <p className="absolute left-0 top-full mt-1 text-xs text-red-400" role="alert">
            {t("errors.invalidTickerSymbol")}
          </p>
        ) : null}
      </div>
      <Button type="submit" disabled={disabled || !query.trim()}>
        {t("watchlist.addButton")}
      </Button>
    </form>
  );
}
