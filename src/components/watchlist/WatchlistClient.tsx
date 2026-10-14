"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StockLandingSearch } from "@/components/stock/StockLandingSearch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DipFinderPanel } from "@/components/watchlist/DipFinderPanel";
import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { useVisibleInterval } from "@/lib/useVisibleInterval";
import type { QuoteHistoryBar } from "@/lib/dipFinder";
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import { WATCHLIST_MAX } from "@/lib/watchlistStorage";
import { cn } from "@/lib/utils";

const QUOTES_REFRESH_MS = 60_000;

export function WatchlistClient() {
  const { t } = useI18n();
  const { symbols, add, remove } = useWatchlist();
  const [quotes, setQuotes] = useState<WatchlistQuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, QuoteHistoryBar[]>>({});

  const loadQuotes = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      if (symbols.length === 0) {
        setQuotes([]);
        setError(null);
        return;
      }
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const q = `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`;
        const res = await fetch(q);
        const data = (await res.json()) as { quotes?: WatchlistQuoteRow[]; error?: string };
        if (!res.ok) {
          // Background refresh failures keep the last good quotes on screen.
          if (silent) return;
          setError(data.error ?? t("watchlist.errRefresh"));
          setQuotes([]);
          return;
        }
        const bySym = new Map((data.quotes ?? []).map((r) => [r.symbol.toUpperCase(), r]));
        const ordered: WatchlistQuoteRow[] = [];
        for (const s of symbols) {
          const row = bySym.get(s);
          if (row) ordered.push(row);
        }
        setQuotes(ordered);
        setError(null);
      } catch {
        if (silent) return;
        setError(t("watchlist.errNetwork"));
        setQuotes([]);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [symbols, t],
  );

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  useEffect(() => {
    if (symbols.length === 0) {
      setHistory({});
      return;
    }
    let cancelled = false;
    const q = `/api/quotes/history?symbols=${encodeURIComponent(symbols.join(","))}`;
    void fetch(q)
      .then(async (res) => {
        const data = (await res.json()) as { history?: Record<string, QuoteHistoryBar[]> };
        if (cancelled || !res.ok) return;
        setHistory(data.history ?? {});
      })
      .catch(() => {
        if (!cancelled) setHistory({});
      });
    return () => {
      cancelled = true;
    };
  }, [symbols]);

  useVisibleInterval(() => void loadQuotes({ silent: true }), QUOTES_REFRESH_MS, symbols.length > 0);

  const quoteMap = useMemo(
    () => new Map(quotes.map((q) => [q.symbol.toUpperCase(), q])),
    [quotes],
  );

  return (
    <div className="flex w-full flex-col gap-4">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{t("watchlist.title")}</h1>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <StockLandingSearch
            onSelectSymbol={(symbol) => void add(symbol)}
            placeholder=""
            submitLabel={t("watchlist.addLabel")}
            disabled={symbols.length >= WATCHLIST_MAX}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => void loadQuotes()} disabled={loading || symbols.length === 0}>
          {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {t("watchlist.refresh")}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {symbols.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-zinc-900/30">
          <CardHeader>
            <CardTitle>{t("watchlist.emptyTitle")}</CardTitle>
            <CardDescription>
              {t("watchlist.emptyDescBefore")}
              <Link href="/stock" className="text-emerald-400 underline-offset-4 hover:underline">
                {t("watchlist.emptyLink")}
              </Link>
              {t("watchlist.emptyDescAfter")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-white/10 bg-zinc-900/40">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>{t("watchlist.colSymbol")}</TableHead>
                <TableHead className="text-right">{t("watchlist.colPrice")}</TableHead>
                <TableHead className="text-right">{t("watchlist.colChange")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t("watchlist.colDip")}</TableHead>
                <TableHead className="w-[100px] text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {symbols.map((sym) => {
                const q = quoteMap.get(sym);
                if (!q) {
                  return (
                    <TableRow key={sym} className="border-white/10">
                      <TableCell>
                        <CompanyIdentity symbol={sym} size="sm" />
                      </TableCell>
                      <TableCell className="text-muted-foreground" colSpan={3}>
                        {loading ? t("watchlist.loading") : t("watchlist.quoteUnavailable")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/dcf-calculator?ticker=${encodeURIComponent(sym)}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>DCF</Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-400"
                          onClick={() => void Promise.resolve(remove(sym))}
                          aria-label={t("watchlist.removeAria", { symbol: sym })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                }
                const positive = q.changesPercentage >= 0;
                return (
                  <TableRow key={sym} className="border-white/10">
                    <TableCell className="max-w-[240px]">
                      <CompanyIdentity
                        symbol={q.symbol}
                        name={q.name}
                        href={`/stock/${encodeURIComponent(sym)}`}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCurrency(q.price)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-sm tabular-nums",
                        positive ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {formatPercent(q.changesPercentage)}
                      <span className="ml-1 text-muted-foreground">({formatCurrency(q.change)})</span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "hidden text-right font-mono text-xs tabular-nums sm:table-cell",
                        q.dipVsSma200Pct != null && q.dipVsSma200Pct < 0
                          ? "text-red-400"
                          : q.dipVsSma200Pct != null && q.dipVsSma200Pct > 0
                            ? "text-emerald-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {q.dipVsSma200Pct != null && Number.isFinite(q.dipVsSma200Pct)
                        ? formatPercent(q.dipVsSma200Pct)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/stock/${encodeURIComponent(sym)}`}
                          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                        >
                          {t("watchlist.analyze")}
                        </Link>
                        <Link href={`/dcf-calculator?ticker=${encodeURIComponent(sym)}`} className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}>DCF</Link>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-400"
                          onClick={() => void Promise.resolve(remove(sym))}
                          aria-label={t("watchlist.removeAria", { symbol: sym })}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="border-t border-white/10 px-4 py-4">
            <DipFinderPanel quotes={quotes} history={history} />
          </div>
        </Card>
      )}
    </div>
  );
}
