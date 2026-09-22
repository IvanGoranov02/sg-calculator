"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { isValidStockSymbolInput } from "@/lib/stockSymbol";
import { resolveStockSearchQuery, suggestCompanies, decodeTickerSegment, type SearchCompany } from "@/lib/stockSearch";
import usCompanies from "@/data/usCompanies.json";

type SearchTarget = "stock" | "dcf" | "dividend";

type StockSearchContainerProps = {
  target: SearchTarget;
  compact?: boolean;
};

/** Remount when the synced ticker changes so the input matches the URL without effects. */
export function StockSearchContainer({ target, compact }: StockSearchContainerProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathTicker = decodeTickerSegment(pathname.match(/^\/stock\/([^/]+)/i)?.[1] ?? "");
  const queryTicker = searchParams.get("ticker") ?? "";
  const syncKey =
    target === "stock" ? `stock-${pathTicker}` : `${target}-${queryTicker}-${searchParams.toString()}`;
  return <StockSearch key={syncKey} target={target} compact={compact} />;
}

/** Picks the route (stock / DCF / dividend calculator) from the current path. */
export function StockSearchWithRoute({ compact }: { compact?: boolean } = {}) {
  const pathname = usePathname();
  const target: SearchTarget = pathname.startsWith("/dcf-calculator")
    ? "dcf"
    : pathname.startsWith("/dividend-calculator")
      ? "dividend"
      : "stock";
  return <StockSearchContainer target={target} compact={compact} />;
}

type StockSearchProps = {
  target: SearchTarget;
  /** Tighter header styling (desktop toolbar). */
  compact?: boolean;
};

type CompanyEntry = SearchCompany;

const INSTANT_COMPANIES = usCompanies as CompanyEntry[];

/**
 * Full company index (~6k SEC filers) is lazy-loaded from /public on first use so
 * it never bloats the shared JS bundle. Until it arrives the bundled top-500
 * gives instant results. Cached at module scope across remounts.
 */
let fullCompaniesPromise: Promise<CompanyEntry[]> | null = null;
function loadFullCompanies(): Promise<CompanyEntry[]> {
  if (!fullCompaniesPromise) {
    fullCompaniesPromise = fetch("/us-companies.json")
      .then((r) => (r.ok ? (r.json() as Promise<CompanyEntry[]>) : INSTANT_COMPANIES))
      .catch(() => INSTANT_COMPANIES);
  }
  return fullCompaniesPromise;
}

function StockSearch({ target, compact }: StockSearchProps) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fromPath = decodeTickerSegment(pathname.match(/^\/stock\/([^/]+)/i)?.[1] ?? "")
    .trim()
    .toUpperCase();
  const fromUrl = searchParams.get("ticker")?.trim() ?? "";
  const [query, setQuery] = useState(() => {
    if (target === "dcf" || target === "dividend") {
      return fromUrl;
    }
    return fromPath || fromUrl || "AAPL";
  });
  const [symbolError, setSymbolError] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [companies, setCompanies] = useState<CompanyEntry[]>(INSTANT_COMPANIES);
  const inputRef = useRef<HTMLInputElement>(null);

  // Pull in the full ~6k company index once (cached); falls back to the bundled set.
  useEffect(() => {
    let active = true;
    void loadFullCompanies().then((list) => {
      if (active && list.length > INSTANT_COMPANIES.length) setCompanies(list);
    });
    return () => {
      active = false;
    };
  }, []);

  // "/" focuses the ticker search from anywhere (unless already typing somewhere).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const suggestionPool = useMemo(
    () => suggestCompanies(companies, query),
    [query, companies],
  );
  const suggestions = open ? suggestionPool : [];

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
    if (target === "dcf") {
      router.push(`/dcf-calculator?ticker=${encodeURIComponent(sym)}`);
    } else if (target === "dividend") {
      router.push(`/dividend-calculator?ticker=${encodeURIComponent(sym)}`);
    } else {
      router.push(`/stock/${encodeURIComponent(sym)}`);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (highlighted >= 0 && highlighted < suggestionPool.length) {
      go(suggestionPool[highlighted].s);
      return;
    }
    const resolved = resolveStockSearchQuery(query, suggestionPool, companies);
    if (!resolved) {
      setSymbolError(true);
      return;
    }
    go(resolved);
  }

  const formClass = compact
    ? "relative flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-border bg-muted/20 px-2 py-0.5 transition-colors focus-within:border-emerald-500/30 focus-within:bg-card focus-within:ring-1 focus-within:ring-emerald-500/20 lg:bg-muted/30 lg:px-2.5 lg:py-1"
    : "relative flex w-full flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg border border-border bg-muted/20 px-2 py-1 transition-colors focus-within:border-emerald-500/30 focus-within:bg-card focus-within:ring-1 focus-within:ring-emerald-500/20 lg:gap-x-2 lg:rounded-xl lg:bg-card lg:px-3 lg:py-1.5 lg:shadow-inner lg:shadow-sm";

  return (
    <form onSubmit={onSubmit} className={formClass}>
      <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${compact ? "h-7 lg:h-8" : "h-8 lg:h-9 lg:gap-2"}`}>
        <Search
          className={`shrink-0 text-muted-foreground ${compact ? "size-3.5 lg:size-4" : "size-4"}`}
          aria-hidden
        />
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
          className={`border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 ${
            compact ? "h-7 text-sm lg:h-8 lg:text-sm" : "h-8 text-base lg:h-9 lg:text-sm"
          }`}
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
        className={
          compact
            ? "size-7 shrink-0 px-0 lg:size-8"
            : "size-8 shrink-0 px-0 lg:h-9 lg:w-auto lg:px-3"
        }
        aria-label={t("search.submit")}
      >
        <Search className={compact ? "size-3.5" : "size-4 lg:hidden"} aria-hidden />
        <span className={compact ? "hidden" : "hidden lg:inline"}>{t("search.submit")}</span>
      </Button>
      {open && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 max-h-[min(38vh,10.5rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover py-0.5 shadow-lg backdrop-blur-sm lg:max-h-60 lg:py-1"
        >
          {suggestions.map((c, i) => (
            <li key={c.s} role="option" aria-selected={i === highlighted}>
              <button
                type="button"
                className={`flex w-full px-2.5 py-1 text-left text-sm lg:px-3 lg:py-1.5 ${
                  i === highlighted ? "bg-emerald-500/15 text-emerald-300" : "hover:bg-muted/50"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  go(c.s);
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
        <p className="basis-full text-xs text-red-400" role="alert">
          {t("errors.invalidTickerSymbol")}
        </p>
      ) : null}
    </form>
  );
}
