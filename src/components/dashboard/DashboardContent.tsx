"use client";

import { Newspaper, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";

import { DashboardDividendsPanel } from "@/components/dashboard/DashboardDividendsPanel";
import { DashboardSparkline } from "@/components/dashboard/DashboardSparkline";
import { DashboardTvWidgets } from "@/components/dashboard/DashboardTvWidgets";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { MarketNewsItem, SparkQuote } from "@/lib/yahooQuickQuote";
import { cn } from "@/lib/utils";

type DashboardContentProps = {
  benchmarks: {
    spy: SparkQuote | null;
    qqq: SparkQuote | null;
    gold: SparkQuote | null;
    silver: SparkQuote | null;
    oil: SparkQuote | null;
  };
  marketNews: MarketNewsItem[];
};

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

function BenchmarkCard({
  quote,
  label,
  href,
}: {
  quote: SparkQuote;
  label: string;
  href: string;
}) {
  const up = quote.changesPercentage >= 0;
  const TrendIcon = up ? TrendingUp : TrendingDown;

  return (
    <Link
      href={href}
      title={quote.name}
      className="group flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-emerald-500/35"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-semibold tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-0.5 font-mono text-base font-semibold tabular-nums leading-none text-foreground sm:text-lg">
          {formatCurrency(quote.price)}
        </p>
        <p
          className={cn(
            "mt-1 flex items-center gap-0.5 font-mono text-[11px] font-medium tabular-nums",
            up ? "text-emerald-400" : "text-red-400",
          )}
        >
          <TrendIcon className="size-3" aria-hidden />
          {formatPercent(quote.changesPercentage)}
        </p>
      </div>
      <DashboardSparkline points={quote.sparkline} className="hidden h-10 w-[5.5rem] shrink-0 sm:block" />
    </Link>
  );
}

function MarketNewsBlobs({ items }: { items: MarketNewsItem[] }) {
  const { t, locale } = useI18n();

  return (
    <section className="flex h-full min-h-0 flex-col rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Newspaper className="size-4 text-sky-400" aria-hidden />
          {t("dashboard.newsTitle")}
        </h2>
      </header>
      <div className="flex-1 p-3">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            {t("dashboard.newsEmpty")}
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            {items.map((item) => {
              const age = formatNewsAge(item.publishedAt, locale);
              return (
                <a
                  key={`${item.link}-${item.title}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex gap-3 rounded-md border border-border/80 bg-muted/20 p-2.5 transition-colors hover:border-sky-500/35 hover:bg-muted/40"
                >
                  {item.thumbnailUrl ? (
                    // External publisher thumbs; hosts vary so skip next/image.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.thumbnailUrl}
                      alt=""
                      className="h-14 w-[4.5rem] shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="h-14 w-[4.5rem] shrink-0 rounded bg-muted" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground/90 group-hover:text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground">
                      {item.publisher ? <span className="truncate">{item.publisher}</span> : null}
                      {age ? (
                        <>
                          {item.publisher ? <span aria-hidden>·</span> : null}
                          <span>{age}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function DashboardContent({ benchmarks, marketNews }: DashboardContentProps) {
  const { t } = useI18n();
  const quotes = [
    benchmarks.spy
      ? { quote: benchmarks.spy, label: t("dashboard.benchSpy"), href: "/stock/SPY" }
      : null,
    benchmarks.qqq
      ? { quote: benchmarks.qqq, label: t("dashboard.benchQqq"), href: "/stock/QQQ" }
      : null,
    benchmarks.gold
      ? { quote: benchmarks.gold, label: t("dashboard.benchGold"), href: "/stock/GC=F" }
      : null,
    benchmarks.silver
      ? { quote: benchmarks.silver, label: t("dashboard.benchSilver"), href: "/stock/SI=F" }
      : null,
    benchmarks.oil
      ? { quote: benchmarks.oil, label: t("dashboard.benchOil"), href: "/stock/CL=F" }
      : null,
  ].filter((x): x is { quote: SparkQuote; label: string; href: string } => x !== null);

  return (
    <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-3 pb-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.welcome")}</p>
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
        className="grid grid-cols-2 gap-2 lg:grid-cols-5"
      >
        {quotes.length > 0 ? (
          quotes.map(({ quote, label, href }) => (
            <BenchmarkCard key={quote.symbol} quote={quote} label={label} href={href} />
          ))
        ) : (
          <p className="col-span-full rounded-lg border border-border px-3 py-4 text-sm text-muted-foreground">
            {t("dashboard.marketUnavailable")}
          </p>
        )}
      </section>

      <DashboardTvWidgets />

      <div className="grid min-h-[22rem] gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
        <MarketNewsBlobs items={marketNews} />
        <DashboardDividendsPanel />
      </div>
    </div>
  );
}
