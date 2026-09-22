"use client";

import { Newspaper, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import { DashboardDividendsPanel } from "@/components/dashboard/DashboardDividendsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { MarketNewsItem, QuickQuote } from "@/lib/yahooQuickQuote";
import { cn } from "@/lib/utils";

type DashboardContentProps = {
  benchmarks: {
    spy: QuickQuote | null;
    qqq: QuickQuote | null;
    gold: QuickQuote | null;
    silver: QuickQuote | null;
    oil: QuickQuote | null;
  };
  marketNews: MarketNewsItem[];
};

type QuoteValueKind = "money" | "rate";

function formatQuoteValue(quote: QuickQuote, kind: QuoteValueKind): string {
  if (kind === "rate") {
    const decimals = quote.symbol.includes("JPY") ? 2 : 4;
    return quote.price.toFixed(decimals);
  }
  return formatCurrency(quote.price);
}

function formatQuoteTime(quote: QuickQuote): string | null {
  if (!quote.regularMarketTime) return quote.marketState ?? null;
  const d = new Date(quote.regularMarketTime);
  if (Number.isNaN(d.getTime())) return quote.marketState ?? null;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MarketQuoteTile({
  quote,
  hint,
  compact = false,
}: {
  quote: QuickQuote;
  hint: string;
  compact?: boolean;
}) {
  const time = formatQuoteTime(quote);
  const up = quote.changesPercentage >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;

  return (
    <div
      className={cn(
        "group relative min-w-[9.5rem] shrink-0 overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur-sm transition-colors hover:border-emerald-500/30",
        compact ? "px-3 py-2.5" : "px-3.5 py-3",
      )}
      title={hint}
    >
      <span
        aria-hidden
        className={cn("absolute inset-y-0 left-0 w-0.5", up ? "bg-emerald-500/70" : "bg-red-500/70")}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-wide text-foreground/95">{quote.symbol.replace("=F", "")}</p>
        <span
          className={cn(
            "flex items-center gap-0.5 font-mono text-[11px] font-medium tabular-nums",
            up ? "text-emerald-400" : "text-red-400",
          )}
        >
          <TrendIcon className="size-3" aria-hidden />
          {formatPercent(quote.changesPercentage)}
        </span>
      </div>
      <p className="mt-1 font-mono text-base font-semibold tabular-nums leading-none text-foreground sm:text-lg">
        {formatQuoteValue(quote, "money")}
      </p>
      {!compact ? (
        <p className="mt-1 truncate text-[10px] text-muted-foreground" title={quote.name}>
          {quote.name}
        </p>
      ) : null}
      {time ? <p className="mt-1 text-[9px] text-muted-foreground/75">{time}</p> : null}
    </div>
  );
}

function formatNewsAge(iso: string | null, locale: "en" | "bg"): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const diffH = Math.round((Date.now() - then) / 3_600_000);
  if (diffH < 1) return locale === "bg" ? "току-що" : "Just now";
  if (diffH < 24) return locale === "bg" ? `преди ${diffH} ч` : `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return locale === "bg" ? `преди ${diffD} д` : `${diffD}d ago`;
}

function MarketNewsSection({ items }: { items: MarketNewsItem[] }) {
  const { t, locale } = useI18n();

  return (
    <Card className="flex h-full flex-col border-border bg-card/80">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-sky-400" aria-hidden />
          {t("dashboard.newsTitle")}
        </CardTitle>
        <CardDescription>{t("dashboard.newsDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-5">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("dashboard.newsEmpty")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => {
              const age = formatNewsAge(item.publishedAt, locale);
              const featured = index === 0;
              return (
                <a
                  key={`${item.link}-${item.title}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(
                    "group flex flex-col justify-between rounded-xl border border-border bg-muted/25 px-3.5 py-3 text-left transition-colors hover:border-sky-500/30 hover:bg-card",
                    featured && "sm:col-span-2 xl:col-span-2 sm:min-h-[7.5rem]",
                  )}
                >
                  <span
                    className={cn(
                      "line-clamp-3 font-medium text-foreground/90 group-hover:text-foreground",
                      featured ? "text-sm sm:text-base sm:line-clamp-2" : "text-xs sm:text-sm",
                    )}
                  >
                    {item.title}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                    {item.publisher ? <span className="truncate">{item.publisher}</span> : null}
                    {age ? (
                      <>
                        {item.publisher ? <span aria-hidden>·</span> : null}
                        <span>{age}</span>
                      </>
                    ) : null}
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardContent({ benchmarks, marketNews }: DashboardContentProps) {
  const { t } = useI18n();
  const quotes = [
    benchmarks.spy ? { quote: benchmarks.spy, hint: t("dashboard.marketSpyHint") } : null,
    benchmarks.qqq ? { quote: benchmarks.qqq, hint: t("dashboard.marketQqqHint") } : null,
    benchmarks.gold ? { quote: benchmarks.gold, hint: t("dashboard.marketGoldHint") } : null,
    benchmarks.silver ? { quote: benchmarks.silver, hint: t("dashboard.marketSilverHint") } : null,
    benchmarks.oil ? { quote: benchmarks.oil, hint: t("dashboard.marketOilHint") } : null,
  ].filter((x): x is { quote: QuickQuote; hint: string } => x !== null);

  const hasBenchmarks = quotes.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-4 pb-2">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border/80 pb-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t("dashboard.title")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("dashboard.welcome")}</p>
        </div>
        <Link
          href="/events"
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-emerald-400 hover:underline"
        >
          {t("dashboard.eventsLink")}
        </Link>
      </header>

      <section
        aria-label={t("dashboard.marketAria")}
        className="overflow-hidden rounded-xl border border-border bg-gradient-to-r from-muted/40 via-card to-muted/20 p-2 sm:p-3"
      >
        {hasBenchmarks ? (
          <div className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {quotes.map(({ quote, hint }) => (
              <MarketQuoteTile key={quote.symbol} quote={quote} hint={hint} compact />
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 text-sm text-muted-foreground">{t("dashboard.marketUnavailable")}</p>
        )}
      </section>

      <div className="grid min-h-[28rem] gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.85fr)] lg:items-stretch">
        <MarketNewsSection items={marketNews} />
        <DashboardDividendsPanel />
      </div>
    </div>
  );
}
