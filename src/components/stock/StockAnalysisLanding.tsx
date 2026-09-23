"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { StockLandingSearch } from "@/components/stock/StockLandingSearch";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import {
  getRecentStockSearchesSnapshot,
  subscribeRecentStockSearches,
  type RecentStockSearch,
} from "@/lib/stockRecentSearches";
import usCompanies from "@/data/usCompanies.json";

const SERVER_RECENT_EMPTY: RecentStockSearch[] = [];

type CompanyEntry = { s: string; n: string };

const NAME_BY_SYMBOL = new Map(
  (usCompanies as CompanyEntry[]).map((c) => [c.s.toUpperCase(), c.n] as const),
);

function resolveCompanyName(symbol: string, stored?: string): string | undefined {
  return stored?.trim() || NAME_BY_SYMBOL.get(symbol.toUpperCase());
}

export function StockAnalysisLanding() {
  const { t } = useI18n();
  const { symbols: watchlistSymbols } = useWatchlist();
  const { status } = useSession();
  const recent = useSyncExternalStore(
    subscribeRecentStockSearches,
    getRecentStockSearchesSnapshot,
    () => SERVER_RECENT_EMPTY,
  );

  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [portfolioLoading, setPortfolioLoading] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") {
      setPortfolioSymbols([]);
      return;
    }
    let cancelled = false;
    setPortfolioLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/portfolio");
        if (!res.ok) throw new Error("portfolio");
        const data = (await res.json()) as {
          holdings?: { symbolYahoo: string }[];
        };
        if (cancelled) return;
        const seen = new Set<string>();
        const syms: string[] = [];
        for (const h of data.holdings ?? []) {
          const sym = h.symbolYahoo.trim().toUpperCase();
          if (!sym || seen.has(sym)) continue;
          seen.add(sym);
          syms.push(sym);
        }
        setPortfolioSymbols(syms);
      } catch {
        if (!cancelled) setPortfolioSymbols([]);
      } finally {
        if (!cancelled) setPortfolioLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status]);

  const watchlistPreview = useMemo(() => watchlistSymbols.slice(0, 12), [watchlistSymbols]);
  const portfolioPreview = useMemo(() => portfolioSymbols.slice(0, 12), [portfolioSymbols]);

  return (
    <div className="mx-auto flex min-w-0 max-w-6xl flex-col gap-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t("stock.landingTitle")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("stock.subtitle")}</p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1">
          <StockLandingSearch />
        </div>
        <div className="min-w-0 lg:w-[min(100%,22rem)] lg:shrink-0">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("stock.recentSearches")}
          </p>
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("stock.noRecent")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {recent.map((entry) => (
                <Link
                  key={entry.symbol}
                  href={`/stock/${encodeURIComponent(entry.symbol)}`}
                  className="rounded-lg border border-border bg-card px-2.5 py-1.5 shadow-sm transition-colors hover:border-emerald-500/30 hover:bg-muted/40"
                >
                  <CompanyIdentity
                    symbol={entry.symbol}
                    name={resolveCompanyName(entry.symbol, entry.name)}
                    size="sm"
                    primaryLabel="symbol"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("stock.watchlistQuick")}</CardTitle>
            <CardDescription>{t("nav.watchlist")}</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            {watchlistPreview.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("watchlist.emptyTitle")}{" "}
                <Link href="/watchlist" className="text-emerald-400 underline-offset-4 hover:underline">
                  {t("nav.watchlist")}
                </Link>
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {watchlistPreview.map((sym) => (
                  <li key={sym}>
                    <Link
                      href={`/stock/${encodeURIComponent(sym)}`}
                      className="block rounded-lg border border-border/80 bg-muted/20 px-3 py-2 hover:border-emerald-500/25 hover:bg-muted/40"
                    >
                      <CompanyIdentity
                        symbol={sym}
                        name={NAME_BY_SYMBOL.get(sym)}
                        size="sm"
                        primaryLabel="symbol"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("stock.portfolioQuick")}</CardTitle>
            <CardDescription>{t("nav.portfolio")}</CardDescription>
          </CardHeader>
          <div className="px-6 pb-6">
            {status !== "authenticated" ? (
              <p className="text-sm text-muted-foreground">
                {t("stock.portfolioSignIn")}{" "}
                <Link href="/login" className="text-emerald-400 underline-offset-4 hover:underline">
                  {t("header.signIn")}
                </Link>
              </p>
            ) : portfolioLoading ? (
              <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
            ) : portfolioPreview.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("stock.portfolioEmpty")}{" "}
                <Link href="/portfolio" className="text-emerald-400 underline-offset-4 hover:underline">
                  {t("nav.portfolio")}
                </Link>
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {portfolioPreview.map((sym) => (
                  <li key={sym}>
                    <Link
                      href={`/stock/${encodeURIComponent(sym)}`}
                      className="block rounded-lg border border-border/80 bg-muted/20 px-3 py-2 hover:border-emerald-500/25 hover:bg-muted/40"
                    >
                      <CompanyIdentity
                        symbol={sym}
                        name={NAME_BY_SYMBOL.get(sym)}
                        size="sm"
                        primaryLabel="symbol"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
