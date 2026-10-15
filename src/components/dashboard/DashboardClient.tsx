"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { useVisibleInterval } from "@/lib/useVisibleInterval";
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import { cn } from "@/lib/utils";

const QUOTES_REFRESH_MS = 60_000;

import { useWatchlist } from "@/components/watchlist/WatchlistProvider";

export function DashboardClient() {
  const { t, locale } = useI18n();
  const { symbols } = useWatchlist();
  const [quotes, setQuotes] = useState<WatchlistQuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const quotesGeneration = useRef(0);
  const quotesRequest = useRef<AbortController | null>(null);

  const loadQuotes = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = opts?.silent === true;
      const generation = ++quotesGeneration.current;
      quotesRequest.current?.abort();
      quotesRequest.current = null;
      if (symbols.length === 0) {
        setQuotes([]);
        setLoading(false);
        setError(null);
        setLastUpdatedAt(null);
        return;
      }
      const controller = new AbortController();
      quotesRequest.current = controller;
      const stale = () => controller.signal.aborted || generation !== quotesGeneration.current;
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`, { signal: controller.signal });
        const data = (await res.json()) as { quotes?: WatchlistQuoteRow[]; error?: string };
        if (stale()) return;
        if (!res.ok) {
          // Background refresh failures keep the last good quotes on screen.
          if (silent) return;
          setQuotes([]);
          setError(data.error ?? t("dashboard.watchlistError"));
          setLastUpdatedAt(null);
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
        setLastUpdatedAt(Date.now());
      } catch {
        if (stale()) return;
        if (silent) return;
        setQuotes([]);
        setError(t("watchlist.errNetwork"));
        setLastUpdatedAt(null);
      } finally {
        if (!stale()) {
          quotesRequest.current = null;
          setLoading(false);
        }
      }
    },
    [symbols, t],
  );

  useEffect(() => {
    void loadQuotes();
    return () => {
      quotesGeneration.current += 1;
      quotesRequest.current?.abort();
      quotesRequest.current = null;
    };
  }, [loadQuotes]);

  useVisibleInterval(() => void loadQuotes({ silent: true }), QUOTES_REFRESH_MS, symbols.length > 0);

  const timeLocale = locale === "bg" ? "bg-BG" : "en-US";
  const updatedLabel =
    lastUpdatedAt !== null
      ? t("dashboard.quotesUpdated", {
          time: new Date(lastUpdatedAt).toLocaleString(timeLocale, {
            dateStyle: "medium",
            timeStyle: "short",
          }),
        })
      : null;

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            {t("dashboard.watchlistTitle")}
            {symbols.length > 0 ? (
              <span className="relative flex size-2" title={updatedLabel ?? undefined} aria-hidden>
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400/70" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
            ) : null}
          </CardTitle>
          <CardDescription>{t("dashboard.watchlistDesc")}</CardDescription>
          {updatedLabel ? (
            <p className="mt-2 text-xs text-muted-foreground">{updatedLabel}</p>
          ) : null}
          {error ? <p className="mt-2 text-sm text-red-400">{error}</p> : null}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={() => void loadQuotes()}
            disabled={loading || symbols.length === 0}
          >
            {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {loading ? <span className="sr-only">{t("dashboard.watchlistLoading")}</span> : null}
            {!loading ? t("dashboard.watchlistRefresh") : null}
          </Button>
          <Link href="/watchlist" className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "rounded-lg")}>
            {t("dashboard.watchlistManage")}
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {symbols.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.watchlistEmptyBefore")}{" "}
            <Link href="/watchlist" className="text-emerald-400 underline-offset-4 hover:underline">
              {t("dashboard.watchlistEmptyLink")}
            </Link>{" "}
            {t("dashboard.watchlistEmptyAfter")}
          </p>
        ) : loading && quotes.length === 0 ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-5 animate-spin text-emerald-500" aria-hidden />
            {t("dashboard.watchlistLoading")}
          </div>
        ) : (
          <div className="overflow-x-auto" aria-label={t("dashboard.watchlistSnapshotAria")}>
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t("dashboard.colSymbol")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("dashboard.colPrice")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("dashboard.colChange")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("dashboard.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.symbol} className="border-border">
                    <TableCell className="max-w-[220px]">
                      <CompanyIdentity
                        symbol={q.symbol}
                        name={q.name}
                        href={`/stock/${encodeURIComponent(q.symbol)}`}
                        size="sm"
                      />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatCurrency(q.price, q.currency)}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono text-sm tabular-nums",
                        q.changesPercentage >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {formatPercent(q.changesPercentage)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Link
                          href={`/stock/${encodeURIComponent(q.symbol)}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 text-xs")}
                        >
                          {t("dashboard.actionAnalysis")}
                        </Link>
                        <Link
                          href={`/dcf-calculator?ticker=${encodeURIComponent(q.symbol)}`}
                          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "h-7 text-xs")}
                        >
                          {t("dashboard.actionDcf")}
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
