"use client";

import { BarChart3, Calculator, ListPlus } from "lucide-react";
import Link from "next/link";

import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { QuickQuote } from "@/lib/yahooQuickQuote";
import { cn } from "@/lib/utils";

type DashboardContentProps = {
  market: { spy: QuickQuote | null; qqq: QuickQuote | null };
};

function MarketQuoteCard({
  quote,
  hint,
}: {
  quote: QuickQuote;
  hint: string;
}) {
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-2.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{quote.symbol}</p>
      <p className="truncate text-xs text-muted-foreground">{quote.name}</p>
      <div className="mt-1 flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-base font-medium tabular-nums text-foreground">
          {formatCurrency(quote.price)}
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
    </div>
  );
}

export function DashboardContent({ market }: DashboardContentProps) {
  const { t } = useI18n();
  const hasMarket = market.spy !== null || market.qqq !== null;

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
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("dashboard.marketUnavailable")}</p>
        )}
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
