"use client";

import { Coins, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildEventDividendEstimatesBySymbol, type EventDividendEstimate } from "@/lib/dividendEstimate";
import {
  flattenUpcomingEvents,
  formatEventRelativeDays,
  type EventKind,
  type FlatEvent,
  type SymbolEventRow,
} from "@/lib/calendarEvents";
import { dividendPaymentDisplayCurrency, type PortfolioDividendPayment } from "@/lib/portfolioDividends";
import { formatLocaleDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { initialPortfolioReady } from "@/lib/eventsSession";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import { displayCurrencyToPortfolioCode } from "@/lib/preferences/preferences";
import type { PortfolioFxRates } from "@/lib/portfolioFx";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import { cn } from "@/lib/utils";

type PortfolioHoldingApi = {
  symbolYahoo: string;
  quantity: string;
  currency: string;
};

const DIVIDEND_KINDS: EventKind[] = ["exDividend", "dividendPay"];

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

function kindShortLabel(kind: EventKind, t: ReturnType<typeof useI18n>["t"]): string {
  if (kind === "exDividend") return t("events.kindExDiv");
  if (kind === "dividendPay") return t("events.kindPay");
  return t("events.kindEarnings");
}

export function DashboardDividendsPanel() {
  const { t, locale } = useI18n();
  const { dateFormat } = usePreferences();
  const { displayCurrency } = usePreferences();
  const preferredCurrency = displayCurrencyToPortfolioCode(displayCurrency);
  const { status: sessionStatus } = useSession();

  const [portfolioReady, setPortfolioReady] = useState(() => initialPortfolioReady(sessionStatus));
  const [holdings, setHoldings] = useState<PortfolioHoldingApi[]>([]);
  const [quotes, setQuotes] = useState<Record<string, PortfolioQuoteRow | null>>({});
  const [fx, setFx] = useState<PortfolioFxRates>({ eurPerUsd: null, gbpPerUsd: null });
  const [payments, setPayments] = useState<PortfolioDividendPayment[]>([]);
  const [eventRows, setEventRows] = useState<SymbolEventRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus === "loading") return;
    if (sessionStatus !== "authenticated") {
      setHoldings([]);
      setQuotes({});
      setFx({ eurPerUsd: null, gbpPerUsd: null });
      setPayments([]);
      setEventRows([]);
      setPortfolioReady(true);
      return;
    }

    let cancelled = false;
    setPortfolioReady(false);

    void (async () => {
      try {
        const [portfolioRes, dividendsRes] = await Promise.all([
          fetch("/api/portfolio", { cache: "no-store" }),
          fetch("/api/portfolio/dividends", { cache: "no-store" }),
        ]);
        if (cancelled) return;

        if (portfolioRes.ok) {
          const data = (await portfolioRes.json()) as {
            holdings?: PortfolioHoldingApi[];
            quotes?: Record<string, PortfolioQuoteRow | null>;
            fx?: PortfolioFxRates;
          };
          setHoldings(data.holdings ?? []);
          setQuotes(data.quotes ?? {});
          setFx(data.fx ?? { eurPerUsd: null, gbpPerUsd: null });
        } else {
          setHoldings([]);
          setQuotes({});
          setFx({ eurPerUsd: null, gbpPerUsd: null });
        }

        if (dividendsRes.ok) {
          const divData = (await dividendsRes.json()) as { payments?: PortfolioDividendPayment[] };
          setPayments(divData.payments ?? []);
        } else {
          setPayments([]);
        }
      } catch {
        if (!cancelled) {
          setHoldings([]);
          setPayments([]);
        }
      } finally {
        if (!cancelled) setPortfolioReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus]);

  const symbols = useMemo(
    () => [...new Set(holdings.map((h) => h.symbolYahoo.trim().toUpperCase()).filter(Boolean))],
    [holdings],
  );

  const loadEvents = useCallback(async () => {
    if (symbols.length === 0) {
      setEventRows([]);
      return;
    }
    setLoadingEvents(true);
    setError(null);
    try {
      const res = await fetch(`/api/events?symbols=${encodeURIComponent(symbols.join(","))}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as { rows?: SymbolEventRow[]; error?: string };
      if (!res.ok) {
        setEventRows([]);
        setError(data.error ?? t("dashboard.divEventsError"));
        return;
      }
      setEventRows(data.rows ?? []);
    } catch {
      setEventRows([]);
      setError(t("dashboard.divEventsError"));
    } finally {
      setLoadingEvents(false);
    }
  }, [symbols, t]);

  useEffect(() => {
    if (!portfolioReady || sessionStatus !== "authenticated") return;
    void loadEvents();
  }, [loadEvents, portfolioReady, sessionStatus]);

  const recentPayments = useMemo(() => {
    return [...payments]
      .filter((p) => p.amount > 0 && p.paidOn)
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn))
      .slice(0, 3);
  }, [payments]);

  const upcomingEvents = useMemo(() => {
    const { upcoming } = flattenUpcomingEvents(eventRows);
    return upcoming
      .filter((e) => DIVIDEND_KINDS.includes(e.kind) && e.days >= 0)
      .slice(0, 3);
  }, [eventRows]);

  const dividendEstimates = useMemo(
    () =>
      holdings.length > 0
        ? buildEventDividendEstimatesBySymbol({
            holdings,
            quotes,
            fx,
            payments,
            displayCurrency: preferredCurrency,
          })
        : new Map<string, EventDividendEstimate>(),
    [holdings, quotes, fx, payments, preferredCurrency],
  );

  const relative = (days: number) =>
    formatEventRelativeDays(days, {
      today: t("events.today"),
      yesterday: t("events.yesterday"),
      daysAgo: t("events.daysAgo"),
      tomorrow: t("events.tomorrow"),
      inDays: t("events.inDays"),
    });

  const loading =
    sessionStatus === "loading" || (sessionStatus === "authenticated" && !portfolioReady) || loadingEvents;

  if (sessionStatus === "unauthenticated") {
    return (
      <Card className="h-full border-border bg-card/80">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Coins className="size-4 text-violet-400" aria-hidden />
            {t("dashboard.divTitle")}
          </CardTitle>
          <CardDescription>{t("dashboard.divSignInDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/portfolio" className="text-sm text-emerald-400 underline-offset-4 hover:underline">
            {t("dashboard.divOpenPortfolio")}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col border-border bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4 text-violet-400" aria-hidden />
              {t("dashboard.divTitle")}
            </CardTitle>
            <CardDescription>{t("dashboard.divDesc")}</CardDescription>
          </div>
          <Link
            href="/portfolio?view=dividends"
            className="text-xs font-medium text-emerald-400 underline-offset-4 hover:underline"
          >
            {t("dashboard.divViewAll")}
          </Link>
        </div>
        {error ? (
          <p className="mt-2 text-xs text-amber-400/90" role="status">
            {error}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-5 pb-5">
        {loading ? (
          <div className="flex flex-1 items-center justify-center gap-2 py-10 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-5 animate-spin text-emerald-500" aria-hidden />
            {t("dashboard.divLoading")}
          </div>
        ) : holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.divNoHoldingsBefore")}{" "}
            <Link href="/portfolio" className="text-emerald-400 underline-offset-4 hover:underline">
              {t("dashboard.divNoHoldingsLink")}
            </Link>{" "}
            {t("dashboard.divNoHoldingsAfter")}
          </p>
        ) : (
          <>
            <section aria-label={t("dashboard.divRecentAria")}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("dashboard.divRecentTitle")}
              </h3>
              {recentPayments.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  {t("dashboard.divRecentEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {recentPayments.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5"
                    >
                      <CompanyIdentity
                        symbol={p.symbolYahoo ?? p.ticker}
                        name={p.name}
                        href={
                          p.symbolYahoo
                            ? `/stock/${encodeURIComponent(p.symbolYahoo)}`
                            : `/stock/${encodeURIComponent(p.ticker)}`
                        }
                        size="sm"
                        className="min-w-0 flex-1"
                      />
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm tabular-nums text-foreground">
                          {fmtMoney(p.amount, dividendPaymentDisplayCurrency(p.paidOn, p.currency))}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatLocaleDate(p.paidOn, locale, dateFormat)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-label={t("dashboard.divUpcomingAria")}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("dashboard.divUpcomingTitle")}
              </h3>
              {upcomingEvents.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
                  {t("dashboard.divUpcomingEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {upcomingEvents.map((event) => (
                    <UpcomingRow
                      key={`${event.symbol}-${event.kind}-${event.date}`}
                      event={event}
                      estimate={dividendEstimates.get(event.symbol.trim().toUpperCase()) ?? null}
                      relative={relative}
                      kindLabel={kindShortLabel(event.kind, t)}
                      estLabel={t("events.estDividend")}
                    />
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UpcomingRow({
  event,
  estimate,
  relative,
  kindLabel,
  estLabel,
}: {
  event: FlatEvent;
  estimate: EventDividendEstimate | null;
  relative: (days: number) => string;
  kindLabel: string;
  estLabel: string;
}) {
  const showEstimate = estimate != null;
  return (
    <li>
      <Link
        href={`/stock/${encodeURIComponent(event.symbol)}`}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 transition-colors hover:border-emerald-500/25 hover:bg-card",
          event.days <= 7 && "border-violet-500/20",
        )}
      >
        <div className="min-w-0 flex-1">
          <CompanyIdentity symbol={event.symbol} name={event.name} size="sm" className="min-w-0" />
          <p className="mt-1 text-[10px] text-muted-foreground">
            <span className="text-violet-400/90">{kindLabel}</span>
            {" · "}
            <span className={cn(event.days <= 7 && "text-amber-400")}>{relative(event.days)}</span>
          </p>
        </div>
        {showEstimate ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-muted-foreground">{estLabel}</p>
            <p className="font-mono text-sm tabular-nums text-emerald-400">
              {fmtMoney(estimate.amount, estimate.currency)}
            </p>
          </div>
        ) : null}
      </Link>
    </li>
  );
}
