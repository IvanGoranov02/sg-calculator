"use client";

import { TrendingDown, TrendingUp } from "lucide-react";
import { useCallback, useMemo } from "react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { WatchlistToggle } from "@/components/watchlist/WatchlistToggle";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatCurrencyEur, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import type { DisplayCurrency } from "@/lib/preferences/preferences";
import type { StockQuote } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

function fmtLive(
  usd: number,
  ccy: DisplayCurrency,
  eurPerUsd: number | null | undefined,
): string {
  if (ccy === "eur" && eurPerUsd != null && Number.isFinite(eurPerUsd) && eurPerUsd > 0) {
    return formatCurrencyEur(usd * eurPerUsd);
  }
  return formatCurrency(usd);
}

function extendedChangeText(
  percent: number | null | undefined,
  change: number | null | undefined,
  fmt: (usd: number) => string,
): string {
  if (percent != null && Number.isFinite(percent)) return formatPercent(percent);
  if (change != null && Number.isFinite(change)) return fmt(change);
  return "—";
}

type StockLiveHeaderProps = {
  quote: StockQuote;
  eurPerUsd?: number | null;
};

export function StockLiveHeader({ quote, eurPerUsd }: StockLiveHeaderProps) {
  const { t } = useI18n();
  const { displayCurrency: ccy, setDisplayCurrency: persistCcy } = usePreferences();

  const canEur = eurPerUsd != null && Number.isFinite(eurPerUsd) && eurPerUsd > 0;

  const fmt = useCallback(
    (usd: number) => fmtLive(usd, ccy, eurPerUsd),
    [ccy, eurPerUsd],
  );

  const positive = quote.changesPercentage >= 0;

  const post = quote.postMarketPrice;
  const showPost =
    post != null &&
    Number.isFinite(post) &&
    post > 0 &&
    (quote.marketState === "POST" ||
      quote.marketState === "POSTPOST" ||
      quote.marketState === "CLOSED");

  const pre = quote.preMarketPrice;
  const showPre =
    !showPost &&
    pre != null &&
    Number.isFinite(pre) &&
    pre > 0 &&
    (quote.marketState === "PRE" || quote.marketState === "PREPRE");

  const postPos =
    (quote.postMarketChangePercent ?? 0) >= 0 || (quote.postMarketChange ?? 0) >= 0;
  const prePos =
    (quote.preMarketChangePercent ?? 0) >= 0 || (quote.preMarketChange ?? 0) >= 0;

  const changeLabel = useMemo(() => {
    if (ccy === "eur" && canEur) {
      return fmtLive(quote.change, "eur", eurPerUsd);
    }
    return formatCurrency(quote.change);
  }, [ccy, canEur, eurPerUsd, quote.change]);

  const sessionLabel = showPost ? t("stock.afterHours") : showPre ? t("stock.preMarket") : null;
  const sessionPrice = showPost ? post : showPre ? pre : null;
  const sessionChange = showPost
    ? extendedChangeText(quote.postMarketChangePercent, quote.postMarketChange, fmt)
    : showPre
      ? extendedChangeText(quote.preMarketChangePercent, quote.preMarketChange, fmt)
      : null;
  const sessionPositive = showPost ? postPos : prePos;

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg shadow-sm sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <CompanyIdentity
              symbol={quote.symbol}
              name={quote.name}
              size="lg"
              primaryLabel="name"
            />
            <WatchlistToggle symbol={quote.symbol} />
          </div>
          {quote.earningsDate ? (
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/90">{t("stock.nextEarnings")}</span>{" "}
              {quote.earningsDate}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col items-end gap-1 self-end sm:self-auto">
          <div className="flex flex-wrap items-baseline justify-end gap-x-2 gap-y-0.5 sm:gap-x-3">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
              {fmt(quote.price)}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 font-mono text-sm font-medium tabular-nums",
                positive ? "text-emerald-400" : "text-red-400",
              )}
            >
              {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {formatPercent(quote.changesPercentage)}
              <span className="text-muted-foreground">({changeLabel})</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
            {sessionLabel && sessionPrice != null && sessionChange ? (
              <div
                className="flex flex-wrap items-baseline justify-end gap-x-1.5"
                data-session-quote={showPost ? "after-hours" : "pre-market"}
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {sessionLabel}
                </span>
                <span className="font-mono text-sm tabular-nums text-foreground">{fmt(sessionPrice)}</span>
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    sessionPositive ? "text-emerald-400" : "text-red-400",
                  )}
                >
                  {sessionChange}
                </span>
              </div>
            ) : null}

            <div
              className="flex items-center gap-1"
              role="group"
              aria-label={t("stock.priceCurrencyGroup")}
            >
              <Button
                type="button"
                size="sm"
                variant={ccy === "usd" ? "secondary" : "ghost"}
                className="h-7 px-2.5 font-mono text-[11px]"
                onClick={() => persistCcy("usd")}
              >
                USD
              </Button>
              <Button
                type="button"
                size="sm"
                variant={ccy === "eur" ? "secondary" : "ghost"}
                className="h-7 px-2.5 font-mono text-[11px]"
                disabled={!canEur}
                title={!canEur ? t("stock.eurUnavailable") : undefined}
                onClick={() => canEur && persistCcy("eur")}
              >
                EUR
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
