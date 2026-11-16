"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DataFreshness } from "@/components/layout/DataFreshness";
import { browserStorage, readWatchlistSnapshot, writeWatchlistSnapshot } from "@/lib/watchlistSnapshot";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DipFinderPanel } from "@/components/watchlist/DipFinderPanel";
import { WatchlistAddSearch } from "@/components/watchlist/WatchlistAddSearch";
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
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  /** Latest quotes/history, so each fetch can save a complete snapshot. */
  const latest = useRef<{ quotes: WatchlistQuoteRow[]; history: Record<string, QuoteHistoryBar[]> }>({ quotes: [], history: {} });
  const hasQuotes = useRef(false);

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
      setRefreshing(true);
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
        const now = Date.now();
        setFetchedAt(now);
        hasQuotes.current = ordered.length > 0;
        latest.current = { ...latest.current, quotes: ordered };
        writeWatchlistSnapshot(browserStorage(), { fetchedAt: now, ...latest.current });
      } catch {
        if (silent) return;
        setError(t("watchlist.errNetwork"));
        setQuotes([]);
      } finally {
        if (!silent) setLoading(false);
        setRefreshing(false);
      }
    },
    [symbols, t],
  );

  useEffect(() => {
    // Paint the last quotes seen in this browser at once, then fetch fresh ones quietly.
    let painted = hasQuotes.current;
    if (!painted && symbols.length > 0) {
      const snap = readWatchlistSnapshot<WatchlistQuoteRow, QuoteHistoryBar>(browserStorage(), symbols);
      if (snap) {
        latest.current = { quotes: snap.quotes, history: snap.history };
        hasQuotes.current = true;
        painted = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from the browser snapshot once
        setQuotes(snap.quotes);
        setHistory(snap.history);
        setFetchedAt(snap.fetchedAt);
      }
    }
    void loadQuotes({ silent: painted });
  }, [loadQuotes, symbols]);

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
        latest.current = { ...latest.current, history: data.history ?? {} };
      })
      .catch(() => {
        // Keep the bars already on screen (from the snapshot) when the refresh fails.
        if (!cancelled) setHistory((prev) => prev);
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{t("watchlist.title")}</h1>
        {symbols.length > 0 ? <DataFreshness at={fetchedAt} refreshing={refreshing} /> : null}
      </div>

      <div className="flex items-end gap-2">
        <WatchlistAddSearch onAdd={add} disabled={symbols.length >= WATCHLIST_MAX} />
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadQuotes()}
          disabled={loading || symbols.length === 0}
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <RefreshCw className="size-4" aria-hidden />
          )}
          <span className="ml-2">{t("watchlist.refresh")}</span>
        </Button>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {symbols.length === 0 ? (
        <Card className="border-dashed border-border bg-card/60">
          <CardHeader>
            <CardTitle>{t("watchlist.emptyTitle")}</CardTitle>
            <CardDescription>
              {t("watchlist.emptyDescBefore")}
              <Link href="/stock" className="text-primary underline-offset-4 hover:underline">
                {t("watchlist.emptyLink")}
              </Link>
              {t("watchlist.emptyDescAfter")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="gap-0 overflow-hidden border-border bg-card/60 py-0">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead>{t("watchlist.colSymbol")}</TableHead>
                <TableHead className="text-right">{t("watchlist.colPrice")}</TableHead>
                <TableHead className="text-right">{t("watchlist.colChange")}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">{t("watchlist.colDip")}</TableHead>
                <TableHead className="w-[170px] text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {symbols.map((sym) => {
                const q = quoteMap.get(sym);
                if (!q) {
                  return (
                    <TableRow key={sym} className="border-border">
                      <TableCell>
                        <CompanyIdentity symbol={sym} size="sm" />
                      </TableCell>
                      <TableCell className="text-muted-foreground" colSpan={3}>
                        {loading ? t("watchlist.loading") : t("watchlist.quoteUnavailable")}
                      </TableCell>
                      <TableCell className="text-right">
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
                  <TableRow key={sym} className="border-border">
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
                        <Link
                          href={`/dcf-calculator?ticker=${encodeURIComponent(sym)}`}
                          className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
                        >
                          {t("watchlist.dcf")}
                        </Link>
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
          <div className="border-t border-border px-4 py-4">
            <DipFinderPanel quotes={quotes} history={history} />
          </div>
        </Card>
      )}
    </div>
  );
}
