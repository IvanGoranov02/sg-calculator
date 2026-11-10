"use client";

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";

import type { PortfolioValueHistoryPayload } from "@/components/portfolio/PortfolioValueHistory";
import {
  buildAnalyticsRows,
  computeDayChange,
  type DashHolding,
  type DashQuotes,
} from "@/lib/dashboardData";
import { computePortfolioAnalytics, type PortfolioAnalyticsData } from "@/lib/portfolioAnalytics";
import type { PortfolioDividendsPayload } from "@/lib/portfolioDividends";
import {
  browserDividendsDayStorage,
  commitPortfolioDividendsDayCache,
  decidePortfolioDividendsLoad,
  readPortfolioDividendsSessionMemory,
  readStoredPortfolioDividendsDayCache,
  userLocalDayStartMs,
} from "@/lib/portfolioDividendsDayCache";
import type { PortfolioFxRates } from "@/lib/portfolioFx";
import {
  browserHoldingsTtlStorage,
  commitPortfolioHoldingsTtlCache,
  PORTFOLIO_HOLDINGS_TTL_MS,
  readStoredPortfolioHoldingsTtlCache,
  type PortfolioHoldingsCachePayload,
} from "@/lib/portfolioHoldingsTtlCache";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import { displayCurrencyToPortfolioCode } from "@/lib/preferences/preferences";

export type DashboardPortfolio = {
  holdings: DashHolding[];
  quotes: DashQuotes;
  fx: PortfolioFxRates;
};

export type DashboardData = {
  authed: boolean;
  signedOut: boolean;
  base: string;
  portfolio: DashboardPortfolio | null;
  portfolioLoading: boolean;
  analytics: PortfolioAnalyticsData | null;
  dayChange: { amount: number; pct: number | null } | null;
  dividends: PortfolioDividendsPayload | null;
  dividendsLoading: boolean;
  valueHistory: PortfolioValueHistoryPayload | null;
  valueHistoryLoading: boolean;
};

/**
 * One place that feeds the whole dashboard. Holdings reuse the 1-hour Portfolio cache and
 * dividends reuse the per-day cache, so opening the dashboard does not add broker requests
 * the Portfolio tab would not have made.
 */
export function useDashboardData(unknownSectorLabel: string): DashboardData {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? "";
  const { displayCurrency } = usePreferences();
  const base = displayCurrencyToPortfolioCode(displayCurrency);

  const [portfolio, setPortfolio] = useState<DashboardPortfolio | null>(null);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [dividends, setDividends] = useState<PortfolioDividendsPayload | null>(null);
  const [dividendsLoading, setDividendsLoading] = useState(false);
  const [valueHistory, setValueHistory] = useState<PortfolioValueHistoryPayload | null>(null);
  const [valueHistoryLoading, setValueHistoryLoading] = useState(false);

  // Holdings + quotes (1h cache shared with the Portfolio tab).
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const storage = browserHoldingsTtlStorage();
    const stored = readStoredPortfolioHoldingsTtlCache(storage, userId);
    if (stored && Date.now() - stored.fetchedAt < PORTFOLIO_HOLDINGS_TTL_MS) {
      const p = stored.payload;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from the shared localStorage cache
      setPortfolio({ holdings: p.holdings, quotes: p.quotes, fx: p.fx });
      return;
    }
    setPortfolioLoading(true);
    fetch("/api/portfolio", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as Partial<PortfolioHoldingsCachePayload>;
      })
      .then((data) => {
        if (!live || !data?.holdings) return;
        const payload: PortfolioHoldingsCachePayload = {
          holdings: data.holdings,
          quotes: data.quotes ?? {},
          fx: data.fx ?? { eurPerUsd: null, gbpPerUsd: null },
          trading212: data.trading212 ?? null,
        };
        setPortfolio({ holdings: payload.holdings, quotes: payload.quotes, fx: payload.fx });
        commitPortfolioHoldingsTtlCache({ storage, userId, payload, reloadToken: 0, liveRefreshToken: 0 });
      })
      .catch(() => {})
      .finally(() => {
        if (live) setPortfolioLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  const hasHoldings = (portfolio?.holdings.length ?? 0) > 0;

  // Dividends (per-day cache shared with the Dividends tab).
  useEffect(() => {
    if (!userId || !hasHoldings) return;
    let live = true;
    const storage = browserDividendsDayStorage();
    const decision = decidePortfolioDividendsLoad<PortfolioDividendsPayload>({
      userId,
      reloadToken: 0,
      liveRefreshToken: 0,
      memory: readPortfolioDividendsSessionMemory<PortfolioDividendsPayload>(),
      stored: readStoredPortfolioDividendsDayCache<PortfolioDividendsPayload>(storage, userId),
    });
    if (decision.action === "reuse" && decision.payload) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDividends(decision.payload);
      return;
    }
    setDividendsLoading(true);
    fetch(`/api/portfolio/dividends?dayStart=${userLocalDayStartMs()}`)
      .then(async (res) => (res.ok ? ((await res.json()) as PortfolioDividendsPayload) : null))
      .then((json) => {
        if (!live || !json || !Array.isArray(json.positions)) return;
        setDividends(json);
        commitPortfolioDividendsDayCache({ storage, userId, payload: json, reloadToken: 0, liveRefreshToken: 0 });
      })
      .catch(() => {})
      .finally(() => {
        if (live) setDividendsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId, hasHoldings]);

  // Value over time (server caches the broker order history).
  useEffect(() => {
    if (!userId || !hasHoldings) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValueHistoryLoading(true);
    fetch(`/api/portfolio/value-history?base=${encodeURIComponent(base)}`)
      .then(async (res) => (res.ok ? ((await res.json()) as PortfolioValueHistoryPayload) : null))
      .then((json) => {
        if (live && json?.chartSeries) setValueHistory(json);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setValueHistoryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [userId, hasHoldings, base]);

  const analytics = useMemo(() => {
    if (!portfolio || portfolio.holdings.length === 0) return null;
    const rows = buildAnalyticsRows(portfolio.holdings, portfolio.quotes, portfolio.fx);
    return { rows, data: computePortfolioAnalytics(rows, portfolio.fx, base, unknownSectorLabel) };
  }, [portfolio, base, unknownSectorLabel]);

  const dayChange = useMemo(
    () => (analytics && portfolio ? computeDayChange(analytics.rows, portfolio.fx, base) : null),
    [analytics, portfolio, base],
  );

  return {
    authed: status === "authenticated",
    signedOut: status === "unauthenticated",
    base,
    portfolio,
    portfolioLoading,
    analytics: analytics?.data ?? null,
    dayChange,
    dividends,
    dividendsLoading,
    valueHistory,
    valueHistoryLoading,
  };
}
