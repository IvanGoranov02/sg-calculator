"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import { WATCHLIST_MAX } from "@/lib/watchlistStorage";
import { cn } from "@/lib/utils";

import { WatchlistDipChart } from "./WatchlistDipChart";
import { useWatchlist } from "./WatchlistProvider";

export function WatchlistClient() {
  const { t } = useI18n();
  const { symbols, add, remove, storageMode } = useWatchlist();
  const [input, setInput] = useState("");
  const [quotes, setQuotes] = useState<WatchlistQuoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadQuotes = useCallback(async () => {
    if (symbols.length === 0) {
      setQuotes([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const q = `/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`;
      const res = await fetch(q);
      const data = (await res.json()) as { quotes?: WatchlistQuoteRow[]; error?: string };
      if (!res.ok) {
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
    } catch {
      setError(t("watchlist.errNetwork"));
      setQuotes([]);
    } finally {
      setLoading(false);
    }
  }, [symbols, t]);

  useEffect(() => {
    void loadQuotes();
  }, [loadQuotes]);

  const quoteMap = useMemo(
    () => new Map(quotes.map((q) => [q.symbol.toUpperCase(), q])),
    [quotes],
  );

  const missingCount = useMemo(
    () => symbols.filter((s) => !quoteMap.has(s)).length,
    [symbols, quoteMap],
  );

  async function onAdd(e: FormEvent) {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (!t) return;
    if (symbols.length >= WATCHLIST_MAX) return;
    await Promise.resolve(add(t));
    setInput("");
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">{t("watchlist.title")}</h1>
        <p className="mt-2 text-muted-foreground">
          {t(
            storageMode === "cloud" ? "watchlist.introCloud" : "watchlist.intro",
            { max: WATCHLIST_MAX },
          )}
        </p>
      </div>

      <form onSubmit={onAdd} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="wl-add" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("watchlist.addLabel")}
          </label>
          <Input
            id="wl-add"
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder={t("watchlist.placeholder")}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <Button type="submit" disabled={symbols.length >= WATCHLIST_MAX || !input.trim()}>
          {t("watchlist.addButton")}
        </Button>
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
      </form>

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
              <Link href="/stock/AAPL" className="text-emerald-400 underline-offset-4 hover:underline">
                {t("watchlist.emptyLink")}
              </Link>
              {t("watchlist.emptyDescAfter")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("watchlist.yourSymbols")}</CardTitle>
            <CardDescription>
              {t("watchlist.savedLine", { count: symbols.length })}
              {missingCount > 0
                ? t("watchlist.delayedInvalid", { n: missingCount })
                : t("watchlist.allQuoted")}
            </CardDescription>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="w-[100px]">{t("watchlist.colSymbol")}</TableHead>
                <TableHead>{t("watchlist.colName")}</TableHead>
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
                      <TableCell className="font-mono font-medium">{sym}</TableCell>
                      <TableCell className="text-muted-foreground" colSpan={4}>
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
                  <TableRow key={sym} className="border-white/10">
                    <TableCell className="font-mono font-medium">{q.symbol}</TableCell>
                    <TableCell className="max-w-[220px] truncate text-muted-foreground">{q.name}</TableCell>
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
            <h3 className="mb-1 text-sm font-semibold tracking-tight">{t("watchlist.dipTitle")}</h3>
            <p className="mb-3 text-xs text-muted-foreground">{t("watchlist.dipSubtitle")}</p>
            <WatchlistDipChart quotes={quotes} />
          </div>
        </Card>
      )}
    </div>
  );
}
