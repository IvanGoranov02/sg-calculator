"use client";

import { BarChart3, Calculator, ListPlus } from "lucide-react";
import Link from "next/link";

import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { MarketNewsItem, QuickQuote } from "@/lib/yahooQuickQuote";
import { cn } from "@/lib/utils";

type DashboardContentProps = {
  market: { spy: QuickQuote | null; qqq: QuickQuote | null; oil: QuickQuote | null };
  commodities: {
    oil: QuickQuote | null;
    brent: QuickQuote | null;
    gold: QuickQuote | null;
    silver: QuickQuote | null;
  };
  currencies: {
    eurUsd: QuickQuote | null;
    gbpUsd: QuickQuote | null;
    usdJpy: QuickQuote | null;
    usdBgn: QuickQuote | null;
  };
  oilNews: MarketNewsItem[];
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

function MarketQuoteCard({
  quote,
  hint,
  valueKind = "money",
  emphasized = false,
}: {
  quote: QuickQuote;
  hint: string;
  valueKind?: QuoteValueKind;
  emphasized?: boolean;
}) {
  const time = formatQuoteTime(quote);

  return (
    <div
      className={cn(
        "min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2.5",
        emphasized && "border-amber-400/25 bg-amber-950/10",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{quote.symbol}</p>
      <p className="truncate text-xs text-muted-foreground">{quote.name}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-base font-medium tabular-nums text-foreground">
          {formatQuoteValue(quote, valueKind)}
        </span>
        <span
          className={cn(
            "font-mono text-sm tabular-nums",
            quote.changesPercentage >= 0 ? "text-emerald-400" : "text-red-400",
          )}
        >
          {formatPercent(quote.changesPercentage)}
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground">{hint}</p>
      {time ? (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
          {time}
          {quote.exchange ? ` · ${quote.exchange}` : ""}
        </p>
      ) : null}
    </div>
  );
}

function QuoteGrid({
  quotes,
  valueKind = "money",
}: {
  quotes: Array<{ quote: QuickQuote | null; hint: string; emphasized?: boolean }>;
  valueKind?: QuoteValueKind;
}) {
  const shown = quotes.filter((x): x is { quote: QuickQuote; hint: string; emphasized?: boolean } => x.quote !== null);
  if (shown.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {shown.map(({ quote, hint, emphasized }) => (
        <MarketQuoteCard
          key={quote.symbol}
          quote={quote}
          hint={hint}
          valueKind={valueKind}
          emphasized={emphasized}
        />
      ))}
    </div>
  );
}

function OilNews({ items }: { items: MarketNewsItem[] }) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("dashboard.oilNewsFallback")}{" "}
        <a
          href="https://finance.yahoo.com/quote/CL=F"
          target="_blank"
          rel="noreferrer"
          className="text-emerald-300 underline-offset-4 hover:underline"
        >
          Yahoo Finance
        </a>
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("dashboard.oilNewsTitle")}
      </p>
      <div className="grid gap-2 md:grid-cols-3">
        {items.map((item) => (
          <a
            key={`${item.link}-${item.title}`}
            href={item.link}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-emerald-500/30 hover:text-foreground"
          >
            <span className="line-clamp-2">{item.title}</span>
            {item.publisher ? <span className="mt-1 block text-[10px] text-muted-foreground/80">{item.publisher}</span> : null}
          </a>
        ))}
      </div>
    </div>
  );
}

export function DashboardContent({ market, commodities, currencies, oilNews }: DashboardContentProps) {
  const { t } = useI18n();
  const hasMarket = market.spy !== null || market.qqq !== null || market.oil !== null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.title")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("dashboard.welcome")}</p>
      </div>

      <section aria-label={t("dashboard.marketAria")} className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("dashboard.marketTitle")}
        </h2>
        {hasMarket ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            {market.spy ? (
              <MarketQuoteCard quote={market.spy} hint={t("dashboard.marketSpyHint")} />
            ) : null}
            {market.qqq ? (
              <MarketQuoteCard quote={market.qqq} hint={t("dashboard.marketQqqHint")} />
            ) : null}
            {market.oil ? (
              <MarketQuoteCard
                quote={market.oil}
                hint={t("dashboard.marketOilHint")}
                emphasized
              />
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("dashboard.marketUnavailable")}</p>
        )}
        <OilNews items={oilNews} />
      </section>

      <section aria-label={t("dashboard.assetsAria")} className="space-y-3">
        <Tabs defaultValue="commodities">
          <TabsList>
            <TabsTrigger value="commodities">{t("dashboard.commoditiesTab")}</TabsTrigger>
            <TabsTrigger value="currencies">{t("dashboard.currenciesTab")}</TabsTrigger>
          </TabsList>
          <TabsContent value="commodities">
            <QuoteGrid
              quotes={[
                { quote: commodities.oil, hint: t("dashboard.marketOilHint"), emphasized: true },
                { quote: commodities.brent, hint: t("dashboard.marketBrentHint") },
                { quote: commodities.gold, hint: t("dashboard.marketGoldHint") },
                { quote: commodities.silver, hint: t("dashboard.marketSilverHint") },
              ]}
            />
          </TabsContent>
          <TabsContent value="currencies">
            <QuoteGrid
              valueKind="rate"
              quotes={[
                { quote: currencies.eurUsd, hint: t("dashboard.fxEurUsdHint") },
                { quote: currencies.gbpUsd, hint: t("dashboard.fxGbpUsdHint") },
                { quote: currencies.usdJpy, hint: t("dashboard.fxUsdJpyHint") },
                { quote: currencies.usdBgn, hint: t("dashboard.fxUsdBgnHint") },
              ]}
            />
          </TabsContent>
        </Tabs>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="Quick links">
        <Link
          href="/stock/AAPL"
          className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full border-white/10 bg-zinc-900/40 transition-colors group-hover:border-emerald-500/30 group-hover:bg-zinc-900/60">
            <CardHeader className="gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <BarChart3 className="size-5" aria-hidden />
              </div>
              <CardTitle className="text-base">{t("dashboard.quickStockTitle")}</CardTitle>
              <CardDescription className="text-sm">{t("dashboard.quickStockDesc")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link
          href="/dcf-calculator?ticker=AAPL"
          className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full border-white/10 bg-zinc-900/40 transition-colors group-hover:border-emerald-500/30 group-hover:bg-zinc-900/60">
            <CardHeader className="gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                <Calculator className="size-5" aria-hidden />
              </div>
              <CardTitle className="text-base">{t("dashboard.quickDcfTitle")}</CardTitle>
              <CardDescription className="text-sm">{t("dashboard.quickDcfDesc")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
        <Link
          href="/watchlist"
          className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Card className="h-full border-white/10 bg-zinc-900/40 transition-colors group-hover:border-emerald-500/30 group-hover:bg-zinc-900/60">
            <CardHeader className="gap-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-sky-500/15 text-sky-400">
                <ListPlus className="size-5" aria-hidden />
              </div>
              <CardTitle className="text-base">{t("dashboard.quickWlTitle")}</CardTitle>
              <CardDescription className="text-sm">{t("dashboard.quickWlDesc")}</CardDescription>
            </CardHeader>
          </Card>
        </Link>
      </section>

      <DashboardClient />
    </div>
  );
}
