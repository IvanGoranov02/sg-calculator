"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import { cn } from "@/lib/utils";

import { useWatchlist } from "@/components/watchlist/WatchlistProvider";

export function DashboardClient() {
  const { t, locale } = useI18n();
  const { symbols } = useWatchlist();
  const [quotes, setQuotes] = useState<WatchlistQuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const loadQuotes = useCallback(async () => {
    if (symbols.length === 0) {
      setQuotes([]);
      setError(null);
      setLastUpdatedAt(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
      const data = (await res.json()) as { quotes?: WatchlistQuoteRow[]; error?: string };
      if (!res.ok) {
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
      setLastUpdatedAt(Date.now());
    } catch {
      setQuotes([]);
      setError(t("watchlist.errNetwork"));
      setLastUpdatedAt(null);
    } finally {
      setLoading(false);
    }
  }, [symbols, t]);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

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
    <Card className="border-white/10 bg-zinc-900/40">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>{t("dashboard.watchlistTitle")}</CardTitle>
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
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-muted-foreground">{t("dashboard.colSymbol")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("dashboard.colPrice")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("dashboard.colChange")}</TableHead>
                  <TableHead className="text-right text-muted-foreground">{t("dashboard.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map((q) => (
                  <TableRow key={q.symbol} className="border-white/10">
                    <TableCell className="font-mono font-medium">{q.symbol}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{formatCurrency(q.price)}</TableCell>
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
