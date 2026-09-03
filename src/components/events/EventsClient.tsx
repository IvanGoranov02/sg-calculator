"use client";

import { CalendarClock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SymbolEventRow } from "@/app/api/events/route";
import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  flattenUpcomingEvents,
  type EventKind,
  type FlatEvent,
  unionEventSymbols,
} from "@/lib/calendarEvents";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const KIND_BADGE: Record<EventKind, string> = {
  earnings: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  exDividend: "bg-sky-500/15 text-sky-300 ring-sky-500/30",
  dividendPay: "bg-violet-500/15 text-violet-300 ring-violet-500/30",
};

export function EventsClient() {
  const { t, locale } = useI18n();
  const { symbols: watchlistSymbols } = useWatchlist();
  const { status: sessionStatus } = useSession();
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [rows, setRows] = useState<SymbolEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbols = useMemo(
    () => unionEventSymbols(watchlistSymbols, portfolioSymbols),
    [watchlistSymbols, portfolioSymbols],
  );

  useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setPortfolioSymbols([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portfolio", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { holdings?: { symbolYahoo: string }[] };
        if (cancelled) return;
        const syms = (data.holdings ?? []).map((h) => h.symbolYahoo);
        setPortfolioSymbols(syms);
      } catch {
        if (!cancelled) setPortfolioSymbols([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const load = useCallback(async () => {
    if (symbols.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { rows?: SymbolEventRow[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? t("events.error"));
        setRows([]);
        return;
      }
      setRows(data.rows ?? []);
    } catch {
      setError(t("events.error"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [symbols, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, undated } = useMemo(() => flattenUpcomingEvents(rows), [rows]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  const relative = (days: number) => {
    if (days <= 0) return t("events.today");
    if (days === 1) return t("events.tomorrow");
    return t("events.inDays", { days });
  };

  const kindLabel = (kind: EventKind) => {
    if (kind === "earnings") return t("events.kindEarnings");
    if (kind === "exDividend") return t("events.kindExDiv");
    return t("events.kindPay");
  };

  const emptyBoth = watchlistSymbols.length === 0 && portfolioSymbols.length === 0;

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
          <CalendarClock className="size-5" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("events.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("events.intro")}</p>
        </div>
      </div>

      {emptyBoth ? (
        <Card className="border-dashed border-white/15 bg-zinc-900/30">
          <CardHeader>
            <CardTitle>{t("events.emptyTitle")}</CardTitle>
            <CardDescription>
              {t("events.emptyDescBefore")}{" "}
              <Link href="/watchlist" className="text-emerald-400 underline-offset-4 hover:underline">
                {t("events.emptyWatchlistLink")}
              </Link>
              {t("events.emptyDescMiddle")}{" "}
              <Link href="/portfolio" className="text-emerald-400 underline-offset-4 hover:underline">
                {t("events.emptyPortfolioLink")}
              </Link>
              {t("events.emptyDescAfter")}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-5 animate-spin text-emerald-500" aria-hidden />
          {t("events.loading")}
        </div>
      ) : error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {error}
        </p>
      ) : (
        <div className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("events.noneUpcoming")}</p>
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {upcoming.map((r: FlatEvent) => (
                <EventRow key={`${r.symbol}-${r.kind}-${r.date}`} event={r} fmtDate={fmtDate} relative={relative} kindLabel={kindLabel} />
              ))}
            </ul>
          )}

          {undated.length > 0 ? (
            <details className="rounded-xl border border-white/10 px-4 py-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("events.noDate", { count: undated.length })}
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

function EventRow({
  event,
  fmtDate,
  relative,
  kindLabel,
}: {
  event: FlatEvent;
  fmtDate: (iso: string) => string;
  relative: (days: number) => string;
  kindLabel: (kind: EventKind) => string;
}) {
  const soon = event.days <= 14;
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 transition-colors hover:bg-white/5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/stock/${encodeURIComponent(event.symbol)}`}
            className="font-mono text-sm font-medium text-emerald-400 hover:underline"
          >
            {event.symbol}
          </Link>
          <span
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset",
              KIND_BADGE[event.kind],
            )}
          >
            {kindLabel(event.kind)}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">{event.name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm tabular-nums">{fmtDate(event.date)}</p>
        <p className={cn("text-xs tabular-nums", soon ? "text-amber-400" : "text-muted-foreground")}>
          {relative(event.days)}
        </p>
      </div>
    </li>
  );
}
