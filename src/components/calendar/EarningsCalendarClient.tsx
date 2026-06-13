"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { EarningsRow } from "@/app/api/earnings/route";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

export function EarningsCalendarClient() {
  const { t, locale } = useI18n();
  const { symbols } = useWatchlist();
  const [rows, setRows] = useState<EarningsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (symbols.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/earnings?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { rows?: EarningsRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("calendar.error"));
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
    } catch {
      setError(t("calendar.error"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [symbols, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, undated } = useMemo(() => {
    const withDate = rows
      .filter((r) => r.earningsDate)
      .map((r) => ({ ...r, days: daysUntil(r.earningsDate as string) }))
      .filter((r) => r.days != null && r.days >= -2)
      .sort((a, b) => (a.days as number) - (b.days as number));
    const without = rows.filter((r) => !r.earningsDate || (daysUntil(r.earningsDate) ?? -99) < -2);
    return { upcoming: withDate, undated: without };
  }, [rows]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const relative = (days: number) => {
    if (days <= 0) return t("calendar.today");
    if (days === 1) return t("calendar.tomorrow");
    return t("calendar.inDays", { days });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
          <CalendarClock className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("calendar.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("calendar.intro")}</p>
        </div>
      </div>

      {symbols.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-zinc-900/30">
          <CardHeader>
            <CardTitle>{t("calendar.emptyTitle")}</CardTitle>
            <CardDescription>
              {t("calendar.emptyDescBefore")}{" "}
              <Link href="/watchlist" className="text-emerald-400 underline-offset-4 hover:underline">
                {t("calendar.emptyLink")}
              </Link>
              {t("calendar.emptyDescAfter")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin text-emerald-500" aria-hidden />
          {t("calendar.loading")}
        </div>
      ) : error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("calendar.noneUpcoming")}</p>
          ) : (
            <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
              {upcoming.map((r) => {
                const days = r.days as number;
                const soon = days <= 14;
                return (
                  <li
                    key={r.symbol}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-white/5"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/stock/${encodeURIComponent(r.symbol)}`}
                        className="font-mono text-sm font-medium text-emerald-400 hover:underline"
                      >
                        {r.symbol}
                      </Link>
                      <p className="truncate text-xs text-muted-foreground">{r.name}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm tabular-nums">{fmtDate(r.earningsDate as string)}</p>
                      <p
                        className={cn(
                          "text-xs tabular-nums",
                          soon ? "text-amber-400" : "text-muted-foreground",
                        )}
                      >
                        {relative(days)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {undated.length > 0 ? (
            <details className="rounded-xl border border-white/10 px-4 py-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("calendar.noDate", { count: undated.length })}
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                {undated.map((r) => (
                  <Link
                    key={r.symbol}
                    href={`/stock/${encodeURIComponent(r.symbol)}`}
                    className="rounded-md border border-white/10 px-2 py-1 font-mono text-xs text-muted-foreground hover:text-foreground"
                  >
                    {r.symbol}
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}
    </div>
  );
}
