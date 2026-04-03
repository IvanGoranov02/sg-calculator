"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { WatchlistToggle } from "@/components/watchlist/WatchlistToggle";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockQuote } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type StockLiveHeaderProps = {
  quote: StockQuote;
};

export function StockLiveHeader({ quote }: StockLiveHeaderProps) {
  const { t } = useI18n();
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

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-4 shadow-lg shadow-black/20 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{quote.name}</h1>
            <Badge variant="secondary" className="font-mono text-xs">
              {quote.symbol}
            </Badge>
            <WatchlistToggle symbol={quote.symbol} />
            {quote.marketState ? (
              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                {quote.marketState}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{t("stock.subtitle")}</p>
          {quote.earningsDate ? (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/90">{t("stock.nextEarnings")}</span>{" "}
              {quote.earningsDate}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col items-start gap-3 sm:items-end">
          <div className="flex flex-wrap items-baseline gap-2 sm:justify-end sm:gap-3">
            <span className="font-mono text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
              {formatCurrency(quote.price)}
            </span>
            <span
              className={cn(
                "flex items-center gap-1 font-mono text-sm font-medium tabular-nums",
                positive ? "text-emerald-400" : "text-red-400",
              )}
            >
              {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
              {formatPercent(quote.changesPercentage)}
              <span className="text-muted-foreground">({formatCurrency(quote.change)})</span>
            </span>
          </div>

          {showPost ? (
            <div className="text-left sm:text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("stock.afterHours")}
              </p>
              <p className="font-mono text-sm tabular-nums text-foreground">{formatCurrency(post!)}</p>
              <p
                className={cn(
                  "font-mono text-xs tabular-nums",
                  postPos ? "text-emerald-400" : "text-red-400",
                )}
              >
                {quote.postMarketChangePercent != null && Number.isFinite(quote.postMarketChangePercent)
                  ? formatPercent(quote.postMarketChangePercent)
                  : quote.postMarketChange != null
                    ? formatCurrency(quote.postMarketChange)
                    : "—"}
              </p>
            </div>
          ) : null}

          {showPre ? (
            <div className="text-left sm:text-right">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("stock.preMarket")}
              </p>
              <p className="font-mono text-sm tabular-nums text-foreground">{formatCurrency(pre!)}</p>
              <p
                className={cn(
                  "font-mono text-xs tabular-nums",
                  prePos ? "text-emerald-400" : "text-red-400",
                )}
              >
                {quote.preMarketChangePercent != null && Number.isFinite(quote.preMarketChangePercent)
                  ? formatPercent(quote.preMarketChangePercent)
                  : quote.preMarketChange != null
                    ? formatCurrency(quote.preMarketChange)
                    : "—"}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
