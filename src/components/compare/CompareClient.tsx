"use client";

import { Loader2, Plus, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { CompareLeads } from "@/components/compare/CompareLeads";
import { CompareMetricTables } from "@/components/compare/CompareMetricTables";
import { CompareSnapshotCards } from "@/components/compare/CompareSnapshotCards";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_COMPARE } from "@/lib/compareMetrics";
import usCompanies from "@/data/usCompanies.json";
import type { CompareRow } from "@/lib/yahooCompare";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import {
  resolveStockSearchQuery,
  suggestCompanies,
  type SearchCompany,
} from "@/lib/stockSearch";
import { cn } from "@/lib/utils";

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

function syncCompareUrl(symbols: string[]) {
  if (typeof window === "undefined") return;
  const qs = symbols.length ? `?symbols=${encodeURIComponent(symbols.join(","))}` : "";
  const next = `/compare${qs}`;
  const cur = `${window.location.pathname}${window.location.search}`;
  if (cur !== next) window.history.replaceState(null, "", next);
}

export function CompareClient({ initialSymbols }: { initialSymbols: string[] }) {
  const { t } = useI18n();
  const [symbols, setSymbols] = useState<string[]>(initialSymbols.slice(0, MAX_COMPARE));
  const [rows, setRows] = useState<CompareRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
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

  const load = useCallback(
    async (syms: string[]) => {
      if (syms.length === 0) {
        setRows([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/compare?symbols=${encodeURIComponent(syms.join(","))}`, {
          cache: "no-store",
        });
        const data = (await res.json()) as { rows?: CompareRow[]; error?: string };
        if (!res.ok) {
          setError(data.error ?? t("compare.error"));
          return;
        }
        const bySym = new Map((data.rows ?? []).map((r) => [r.symbol.toUpperCase(), r]));
        setRows(syms.map((s) => bySym.get(s)).filter((r): r is CompareRow => r != null));
      } catch {
        setError(t("compare.error"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(symbols);
    syncCompareUrl(symbols);
  }, [symbols, load]);

  const selected = useMemo(() => new Set(symbols), [symbols]);
  const suggestionPool = useMemo(
    () => suggestCompanies(companies, input).filter((c) => !selected.has(c.s.toUpperCase())),
    [companies, input, selected],
  );
  const suggestions = open ? suggestionPool : [];

  function addTicker(raw: string) {
    const resolved = resolveStockSearchQuery(raw, suggestionPool, companies) ?? raw.trim().toUpperCase();
    if (!resolved || !isValidStockSymbolInput(resolved)) return;
    const s = resolved.toUpperCase();
    if (selected.has(s) || symbols.length >= MAX_COMPARE) return;
    setSymbols((prev) => [...prev, s]);
    setInput("");
    setOpen(false);
    setHighlighted(-1);
  }

  function addSymbol(e: FormEvent) {
    e.preventDefault();
    if (highlighted >= 0 && highlighted < suggestionPool.length) {
      addTicker(suggestionPool[highlighted].s);
      return;
    }
    addTicker(input);
  }

  function removeSymbol(s: string) {
    setSymbols((prev) => prev.filter((x) => x !== s));
  }

  const loadedSet = new Set(rows.map((r) => r.symbol.toUpperCase()));
  const unresolved = symbols.filter((s) => !loadedSet.has(s));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("compare.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("compare.intro", { max: MAX_COMPARE })}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {symbols.map((s) => {
          const row = rows.find((r) => r.symbol.toUpperCase() === s);
          return (
            <span
              key={s}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-sm shadow-sm"
            >
              <CompanyIdentity symbol={s} name={row?.name} size="sm" />
              <button
                type="button"
                onClick={() => removeSymbol(s)}
                className="rounded-md p-0.5 text-muted-foreground hover:bg-muted hover:text-red-600 dark:hover:text-red-400"
                aria-label={t("compare.remove", { symbol: s })}
              >
                <X className="size-3.5" />
              </button>
            </span>
          );
        })}
        {symbols.length < MAX_COMPARE ? (
          <form onSubmit={addSymbol} className="relative flex items-center gap-1.5">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value.toUpperCase());
                setOpen(true);
                setHighlighted(-1);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                setTimeout(() => {
                  setOpen(false);
                  setHighlighted(-1);
                }, 120);
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
              placeholder={t("compare.addPlaceholder")}
              className="h-9 w-40 bg-card"
              maxLength={12}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-autocomplete="list"
            />
            <Button type="submit" size="sm" variant="outline" disabled={!input.trim()}>
              <Plus className="size-4" />
            </Button>
            {open && suggestions.length > 0 ? (
              <ul
                role="listbox"
                className="absolute left-0 top-full z-50 mt-1 w-64 overflow-hidden rounded-lg border border-border bg-popover py-1 shadow-md"
              >
                {suggestions.map((c, i) => (
                  <li key={c.s} role="option" aria-selected={i === highlighted}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full px-3 py-1.5 text-left text-sm",
                        i === highlighted ? "bg-emerald-500/15" : "hover:bg-muted/50",
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTicker(c.s);
                      }}
                      onMouseEnter={() => setHighlighted(i)}
                    >
                      <CompanyIdentity symbol={c.s} name={c.n} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </form>
        ) : null}
        {loading ? <Loader2 className="size-4 animate-spin text-emerald-500" aria-hidden /> : null}
      </div>

      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {!loading && unresolved.length > 0 ? (
        <p
          className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
          role="status"
        >
          {t("compare.unresolved", { symbols: unresolved.join(", ") })}
        </p>
      ) : null}

      {rows.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t("compare.empty")}</p>
      ) : rows.length === 0 && loading ? (
        <p className="text-sm text-muted-foreground">{t("loading.stock")}</p>
      ) : rows.length > 0 ? (
        <>
          <CompareSnapshotCards rows={rows} />
          <CompareLeads rows={rows} />
          <CompareMetricTables rows={rows} />
        </>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("compare.footnote")}</p>
    </div>
  );
}
