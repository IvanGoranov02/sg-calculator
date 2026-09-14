"use client";

import { BarChart3, CalendarClock, Coins, Loader2, TrendingDown } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { SymbolEventRow } from "@/lib/calendarEvents";
import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  flattenUpcomingEvents,
  formatDayGutter,
  formatEventRelativeDays,
  formatWeekRangeLabel,
  groupEventsByWeek,
  type EventKind,
  type FlatEvent,
  unionEventSymbols,
} from "@/lib/calendarEvents";
import { buildEventDividendEstimatesBySymbol, type EventDividendEstimate } from "@/lib/dividendEstimate";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { initialPortfolioReady } from "@/lib/eventsSession";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import { displayCurrencyToPortfolioCode } from "@/lib/preferences/preferences";
import type { PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioDividendPayment } from "@/lib/portfolioDividends";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import { cn } from "@/lib/utils";

type PortfolioHoldingApi = {
  symbolYahoo: string;
  quantity: string;
  currency: string;
};

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return n.toFixed(2);
  }
}

const KIND_META: Record<
  EventKind,
  { icon: typeof BarChart3; labelClass: string; cardAccent: string }
> = {
  earnings: {
    icon: BarChart3,
    labelClass: "text-emerald-400",
    cardAccent: "border-emerald-500/20",
  },
  exDividend: {
    icon: TrendingDown,
    labelClass: "text-sky-400",
    cardAccent: "border-sky-500/20",
  },
  dividendPay: {
    icon: Coins,
    labelClass: "text-violet-400",
    cardAccent: "border-violet-500/20",
  },
};

export function EventsClient() {
  const { t, locale } = useI18n();
  const { displayCurrency } = usePreferences();
  const preferredCurrency = displayCurrencyToPortfolioCode(displayCurrency);
  const { symbols: watchlistSymbols } = useWatchlist();
  const { status: sessionStatus } = useSession();
  const [portfolioSymbols, setPortfolioSymbols] = useState<string[]>([]);
  const [portfolioHoldings, setPortfolioHoldings] = useState<PortfolioHoldingApi[]>([]);
  const [portfolioQuotes, setPortfolioQuotes] = useState<Record<string, PortfolioQuoteRow | null>>({});
  const [portfolioFx, setPortfolioFx] = useState<PortfolioFxRates>({ eurPerUsd: null, gbpPerUsd: null });
  const [dividendPayments, setDividendPayments] = useState<PortfolioDividendPayment[]>([]);
  const [portfolioReady, setPortfolioReady] = useState(() => initialPortfolioReady(sessionStatus));
  const [rows, setRows] = useState<SymbolEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbols = useMemo(
    () => unionEventSymbols(watchlistSymbols, portfolioSymbols),
    [watchlistSymbols, portfolioSymbols],
  );

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (sessionStatus !== "authenticated") {
      setPortfolioSymbols([]);
      setPortfolioHoldings([]);
      setPortfolioQuotes({});
      setPortfolioFx({ eurPerUsd: null, gbpPerUsd: null });
      setDividendPayments([]);
      setPortfolioReady(true);
      return;
    }

    let cancelled = false;
    setPortfolioReady(false);

    void (async () => {
      try {
        const portfolioRes = await fetch("/api/portfolio", { cache: "no-store" });
        if (cancelled) return;
        if (portfolioRes.ok) {
          const data = (await portfolioRes.json()) as {
            holdings?: PortfolioHoldingApi[];
            quotes?: Record<string, PortfolioQuoteRow | null>;
            fx?: PortfolioFxRates;
          };
          const holdings = data.holdings ?? [];
          setPortfolioHoldings(holdings);
          setPortfolioQuotes(data.quotes ?? {});
          setPortfolioFx(data.fx ?? { eurPerUsd: null, gbpPerUsd: null });
          setPortfolioSymbols(holdings.map((h) => h.symbolYahoo));
        } else {
          setPortfolioHoldings([]);
          setPortfolioQuotes({});
          setPortfolioFx({ eurPerUsd: null, gbpPerUsd: null });
          setPortfolioSymbols([]);
        }
      } catch {
        if (!cancelled) {
          setPortfolioHoldings([]);
          setPortfolioQuotes({});
          setPortfolioFx({ eurPerUsd: null, gbpPerUsd: null });
          setPortfolioSymbols([]);
        }
      } finally {
        if (!cancelled) setPortfolioReady(true);
      }
    })();

    void (async () => {
      try {
        const dividendsRes = await fetch("/api/portfolio/dividends", { cache: "no-store" });
        if (cancelled) return;
        if (dividendsRes.ok) {
          const divData = (await dividendsRes.json()) as { payments?: PortfolioDividendPayment[] };
          setDividendPayments(divData.payments ?? []);
        } else if (!cancelled) {
          setDividendPayments([]);
        }
      } catch {
        if (!cancelled) setDividendPayments([]);
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
  const weekGroups = useMemo(() => groupEventsByWeek(upcoming), [upcoming]);
  const dividendEstimates = useMemo(
    () =>
      portfolioHoldings.length > 0
        ? buildEventDividendEstimatesBySymbol({
            holdings: portfolioHoldings,
            quotes: portfolioQuotes,
            fx: portfolioFx,
            payments: dividendPayments,
            displayCurrency: preferredCurrency,
          })
        : new Map<string, EventDividendEstimate>(),
    [portfolioHoldings, portfolioQuotes, portfolioFx, dividendPayments, preferredCurrency],
  );

  const relative = (days: number) =>
    formatEventRelativeDays(days, {
      today: t("events.today"),
      yesterday: t("events.yesterday"),
      daysAgo: t("events.daysAgo"),
      tomorrow: t("events.tomorrow"),
      inDays: t("events.inDays"),
    });

  const kindLabel = (kind: EventKind) => {
    if (kind === "earnings") return t("events.kindEarnings");
    if (kind === "exDividend") return t("events.kindExDiv");
    return t("events.kindPay");
  };

  const symbolsSettling =
    sessionStatus === "loading" || (sessionStatus === "authenticated" && !portfolioReady);
  const emptyBoth =
    !symbolsSettling && watchlistSymbols.length === 0 && portfolioSymbols.length === 0;
  const showLoading = symbolsSettling || loading;

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
      ) : showLoading ? (
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
        <div className="space-y-8">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("events.noneUpcoming")}</p>
          ) : (
            weekGroups.map((week) => (
              <section key={week.weekStart} className="space-y-4">
                <h2 className="text-center text-xs font-medium tracking-widest text-muted-foreground uppercase">
                  {formatWeekRangeLabel(week.weekStart, week.weekEnd)}
                </h2>
                <div className="space-y-4">
                  {week.days.map((day) => {
                    const gutter = formatDayGutter(day.date, locale);
                    return (
                      <div key={day.date} className="flex gap-3 sm:gap-4">
                        <div
                          className="flex w-11 shrink-0 flex-col items-center pt-3 sm:w-12"
                          aria-hidden
                        >
                          <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
                            {gutter.weekday}
                          </span>
                          <span className="text-2xl leading-none font-semibold tabular-nums sm:text-3xl">
                            {gutter.day}
                          </span>
                        </div>
                        <div className="grid min-w-0 flex-1 gap-2 sm:gap-3 lg:grid-cols-2 xl:grid-cols-2">
                          {day.events.map((event) => (
                            <EventCard
                              key={`${event.symbol}-${event.kind}-${event.date}`}
                              event={event}
                              kindLabel={kindLabel}
                              relative={relative}
                              estimate={
                                dividendEstimates.get(event.symbol.trim().toUpperCase()) ?? null
                              }
                              estDividendLabel={t("events.estDividend")}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}

          {undated.length > 0 ? (
            <details className="rounded-xl border border-white/10 px-4 py-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                {t("events.noDate", { count: undated.length })}
              </summary>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {undated.map((r) => (
                  <Link
                    key={r.symbol}
                    href={`/stock/${encodeURIComponent(r.symbol)}`}
                    className="rounded-xl border border-white/10 bg-zinc-900/40 px-3 py-2.5 transition-colors hover:bg-zinc-900/60"
                  >
                    <CompanyIdentity
                      symbol={r.symbol}
                      name={r.name}
                      size="sm"
                      primaryLabel="name"
                      className="min-w-0"
                    />
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

function EventCard({
  event,
  kindLabel,
  relative,
  estimate,
  estDividendLabel,
}: {
  event: FlatEvent;
  kindLabel: (kind: EventKind) => string;
  relative: (days: number) => string;
  estimate: EventDividendEstimate | null;
  estDividendLabel: string;
}) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const soon = event.days <= 14;
  const showEstimate =
    estimate != null && (event.kind === "exDividend" || event.kind === "dividendPay");

  return (
    <Link
      href={`/stock/${encodeURIComponent(event.symbol)}`}
      className={cn(
        "block rounded-2xl border bg-zinc-900/60 px-4 py-3.5 shadow-sm transition-colors hover:bg-zinc-900/80",
        meta.cardAccent,
      )}
    >
      <div className={cn("mb-2 flex items-center gap-1.5 text-xs font-medium", meta.labelClass)}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span>{kindLabel(event.kind)}</span>
      </div>
      <CompanyIdentity
        symbol={event.symbol}
        name={event.name}
        size="md"
        primaryLabel="name"
        className="min-w-0"
      />
      <p className="mt-2 text-sm">
        <span className={cn("tabular-nums", soon ? "text-amber-400" : "text-muted-foreground")}>
          {relative(event.days)}
        </span>
      </p>
      {showEstimate ? (
        <div
          className="mt-3 rounded-lg border border-emerald-500/35 bg-emerald-950/50 px-3 py-2.5"
          aria-label={`${estDividendLabel}: ${fmtMoney(estimate.amount, estimate.currency)}`}
        >
          <p className="text-[11px] font-medium tracking-wide text-emerald-200/75 uppercase">
            {estDividendLabel}
          </p>
          <p className="mt-0.5 text-lg font-semibold tracking-tight text-emerald-300 tabular-nums sm:text-xl">
            {fmtMoney(estimate.amount, estimate.currency)}
          </p>
        </div>
      ) : null}
    </Link>
  );
}
