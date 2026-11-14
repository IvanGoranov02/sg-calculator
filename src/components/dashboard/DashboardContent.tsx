"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  AllocationWidget,
  DividendIncomeWidget,
  HoldingsWidget,
  KpiRow,
  MarketStrip,
  MoversWidget,
  NewsWidget,
  PortfolioCta,
  UpcomingWidget,
  ValueWidget,
  WatchlistWidget,
  useDashText,
  type MarketTile,
} from "@/components/dashboard/DashboardWidgets";
import { useWatchlist } from "@/components/watchlist/WatchlistProvider";
import { buildAnalyticsRows } from "@/lib/dashboardData";
import { useDashboardData } from "@/lib/useDashboardData";
import { useVisibleInterval } from "@/lib/useVisibleInterval";
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";
import type { MarketNewsItem } from "@/lib/yahooQuickQuote";
import { useMemo } from "react";

const QUOTES_REFRESH_MS = 60_000;

export function DashboardContent({ tiles, news }: { tiles: MarketTile[]; news: MarketNewsItem[] }) {
  const { c } = useDashText();
  const data = useDashboardData(c.other);
  const { symbols } = useWatchlist();
  const [watch, setWatch] = useState<WatchlistQuoteRow[]>([]);
  const [watchLoading, setWatchLoading] = useState(false);

  const loadWatch = useCallback(
    async (silent: boolean) => {
      if (symbols.length === 0) {
        setWatch([]);
        return;
      }
      if (!silent) setWatchLoading(true);
      try {
        const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
        if (!res.ok) return;
        const json = (await res.json()) as { quotes?: WatchlistQuoteRow[] };
        const bySym = new Map((json.quotes ?? []).map((r) => [r.symbol.toUpperCase(), r]));
        setWatch(symbols.map((s) => bySym.get(s)).filter((r): r is WatchlistQuoteRow => Boolean(r)));
      } catch {
        /* keep last good quotes */
      } finally {
        if (!silent) setWatchLoading(false);
      }
    },
    [symbols],
  );

  useEffect(() => {
    void loadWatch(false);
  }, [loadWatch]);
  useVisibleInterval(() => void loadWatch(true), QUOTES_REFRESH_MS, symbols.length > 0);

  const { portfolio, analytics } = data;
  const rows = useMemo(
    () => (portfolio ? buildAnalyticsRows(portfolio.holdings, portfolio.quotes, portfolio.fx) : []),
    [portfolio],
  );
  const hasPortfolio = analytics != null && portfolio != null;

  return (
    <div className="mx-auto w-full max-w-[1800px] space-y-3 px-0 py-1 sm:px-3 sm:py-2 lg:px-6">
      <MarketStrip tiles={tiles} />

      {!hasPortfolio && !data.portfolioLoading && data.authed !== undefined && (data.signedOut || data.authed) ? (
        <PortfolioCta signedOut={data.signedOut} />
      ) : null}

      {hasPortfolio ? (
        <>
          <KpiRow
            analytics={analytics}
            dayChange={data.dayChange}
            dividends={data.dividends}
            base={data.base}
            positions={portfolio.holdings.length}
          />
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <ValueWidget history={data.valueHistory} loading={data.valueHistoryLoading} base={data.base} />
            </div>
            <div className="xl:col-span-4">
              <AllocationWidget analytics={analytics} />
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <HoldingsWidget rows={rows} fx={portfolio.fx} base={data.base} total={analytics.totalValue} />
            </div>
            <div className="xl:col-span-4">
              <UpcomingWidget holdings={portfolio.holdings} quotes={portfolio.quotes} dividends={data.dividends} />
            </div>
          </div>
          <DividendIncomeWidget dividends={data.dividends} loading={data.dividendsLoading} base={data.base} />
        </>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-12">
        <div className="xl:col-span-6">
          <WatchlistWidget rows={watch} loading={watchLoading} count={symbols.length} />
        </div>
        <div className="xl:col-span-6">
          <MoversWidget analytics={analytics} watch={watch} />
        </div>
        <div className="lg:col-span-2 xl:col-span-12">
          <NewsWidget items={news} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 pt-1 text-xs text-muted-foreground">
        {(
          [
            ["/portfolio", c.linkPortfolio],
            ["/watchlist", c.watchlist],
            ["/dcf-calculator", "DCF"],
            ["/events", c.linkEvents],
            ["/reads", c.linkReads],
          ] as const
        ).map(([href, label]) => (
          <Link key={href} href={href} className="hover:text-primary">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
