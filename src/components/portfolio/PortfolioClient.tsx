"use client";

import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatDecimalAsPercent,
  formatDividendYieldPercent,
  formatLocaleDateShort,
  formatPercent,
  resolveDateLocaleTag,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import { displayCurrencyToPortfolioCode } from "@/lib/preferences/preferences";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import {
  convertPortfolioMoney,
  listingCurrencyOverride,
  normalizePortfolioCurrency,
  type PortfolioFxRates,
} from "@/lib/portfolioFx";
import { cn } from "@/lib/utils";
import {
  PortfolioAllocationSection,
  PortfolioMoversSection,
  PortfolioSummarySection,
  usePortfolioAnalytics,
  type AnalyticsRow,
} from "@/components/portfolio/PortfolioAnalytics";
import { PortfolioDividendsView } from "@/components/portfolio/PortfolioDividendsView";
import {
  PortfolioManualMonthlyValueCard,
  PortfolioValueChartCard,
  type PortfolioValueHistoryPayload,
} from "@/components/portfolio/PortfolioValueHistory";
import { DipFinderPanel } from "@/components/watchlist/DipFinderPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  buildDipHistorySymbolMappings,
  remapPortfolioDipHistory,
  type QuoteHistoryBar,
} from "@/lib/dipFinder";
import {
  isTrading212AuthFailure,
  looksLikeTrading212ErrorMessage,
  normalizeTrading212ErrorMessage,
} from "@/lib/trading212Errors";

const MANUAL_CURRENCIES = ["EUR", "USD", "GBP"] as const;

type HoldingApi = {
  id: string;
  symbolYahoo: string;
  symbolT212: string | null;
  quantity: string;
  avgPrice: string;
  currency: string;
  source: "manual" | "t212";
  updatedAt: string;
};

type Trading212Api = {
  encryptionConfigured: boolean;
  connected: boolean;
  environment: "demo" | "live" | null;
  lastSyncAt: string | null;
  lastError: string | null;
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

/** True when an earnings date is within the next ~14 days (worth flagging). */
function isEarningsSoon(iso: string): boolean {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  const days = (t - Date.now()) / 86_400_000;
  return days >= -1 && days <= 14;
}

type PortfolioView = "holdings" | "dividends";

function portfolioViewHref(view: PortfolioView, search: string): string {
  const params = new URLSearchParams(search);
  if (view === "holdings") params.delete("view");
  else params.set("view", "dividends");
  const q = params.toString();
  return q ? `/portfolio?${q}` : "/portfolio";
}

export function PortfolioClient() {
  const { t, locale } = useI18n();
  const { displayCurrency, dateFormat } = usePreferences();
  const preferredPortfolioCurrency = displayCurrencyToPortfolioCode(displayCurrency);
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlView: PortfolioView = searchParams.get("view") === "dividends" ? "dividends" : "holdings";
  // router.replace updates search params asynchronously. Keep the selected tab local so
  // a Holdings click is not ignored while Dividends is still the active tab.
  const [portfolioView, setPortfolioViewState] = useState<PortfolioView>(urlView);
  const desiredView = useRef<PortfolioView>(urlView);
  const userChoseView = useRef(false);
  const setPortfolioView = useCallback(
    (view: PortfolioView) => {
      userChoseView.current = true;
      desiredView.current = view;
      setPortfolioViewState(view);
      router.replace(portfolioViewHref(view, window.location.search), { scroll: false });
    },
    [router],
  );
  useEffect(() => {
    if (!userChoseView.current) {
      desiredView.current = urlView;
      setPortfolioViewState(urlView);
      return;
    }
    if (urlView === desiredView.current) return;
    router.replace(portfolioViewHref(desiredView.current, window.location.search), { scroll: false });
  }, [router, urlView]);
  const [holdings, setHoldings] = useState<HoldingApi[]>([]);
  const [quotes, setQuotes] = useState<Record<string, PortfolioQuoteRow | null>>({});
  const [trading212, setTrading212] = useState<Trading212Api | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [t212Env, setT212Env] = useState<"demo" | "live">("demo");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncT212Status, setLastSyncT212Status] = useState<number | null>(null);

  const [sym, setSym] = useState("");
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [manualCurrency, setManualCurrency] = useState<string>(preferredPortfolioCurrency);
  const [adding, setAdding] = useState(false);

  const [fx, setFx] = useState<PortfolioFxRates>({ eurPerUsd: null, gbpPerUsd: null });
  const [dipHistory, setDipHistory] = useState<Record<string, QuoteHistoryBar[]>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [editCurrency, setEditCurrency] = useState("EUR");
  const [savingEdit, setSavingEdit] = useState(false);

  /** Non-error info (e.g. per-symbol sync skip or manual replacing broker row). */
  const [portfolioInfo, setPortfolioInfo] = useState<string | null>(null);
  const [dividendsReloadToken, setDividendsReloadToken] = useState(0);
  const [dividendsLiveRefreshToken, setDividendsLiveRefreshToken] = useState(0);

  const [valueHistory, setValueHistory] = useState<PortfolioValueHistoryPayload | null>(null);
  const [valueHistoryLoading, setValueHistoryLoading] = useState(false);
  const [historyBackfillPaused, setHistoryBackfillPaused] = useState(false);
  const historyPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyPollCount = useRef(0);
  const historyLoadInFlight = useRef(false);
  const historyLoadQueued = useRef(false);
  const historyRefreshQueued = useRef(false);
  const [savingMonthlyValue, setSavingMonthlyValue] = useState(false);

  useEffect(() => {
    setManualCurrency(preferredPortfolioCurrency);
  }, [preferredPortfolioCurrency]);

  const load = useCallback(async (opts?: { clearPageError?: boolean }) => {
    setLoading(true);
    if (opts?.clearPageError !== false) {
      setError(null);
    }
    try {
      const [portfolioRes, settingsRes] = await Promise.all([
        fetch("/api/portfolio"),
        fetch("/api/trading212/settings"),
      ]);

      // Settings load even when /api/portfolio fails (e.g. Yahoo/DB), so Save isn't wrongly disabled.
      if (settingsRes.ok) {
        const s = (await settingsRes.json()) as {
          encryptionConfigured?: boolean;
          connected?: boolean;
          environment?: "demo" | "live" | null;
          lastSyncAt?: string | null;
          lastError?: string | null;
        };
        if (typeof s.encryptionConfigured === "boolean") {
          setTrading212({
            encryptionConfigured: s.encryptionConfigured,
            connected: !!s.connected,
            environment: s.environment ?? null,
            lastSyncAt: s.lastSyncAt ?? null,
            lastError: s.lastError ?? null,
          });
          if (s.environment) setT212Env(s.environment);
        }
      }

      if (portfolioRes.status === 401) {
        setHoldings([]);
        setQuotes({});
        setTrading212(null);
        setError(null);
        return;
      }

      const data = (await portfolioRes.json()) as {
        holdings?: HoldingApi[];
        quotes?: Record<string, PortfolioQuoteRow | null>;
        fx?: PortfolioFxRates;
        trading212?: Trading212Api;
        error?: string;
      };
      if (data.fx) setFx(data.fx);

      if (!portfolioRes.ok) {
        setError(data.error ?? t("portfolio.errorLoad"));
        setHoldings([]);
        setQuotes({});
        return;
      }

      setHoldings(data.holdings ?? []);
      setQuotes(data.quotes ?? {});
      if (data.trading212) {
        setTrading212(data.trading212);
        if (data.trading212.environment) setT212Env(data.trading212.environment);
      }
    } catch {
      setError(t("portfolio.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadValueHistoryRef = useRef<(opts?: { poll?: boolean; refresh?: boolean }) => Promise<void>>(
    async () => {},
  );

  const clearHistoryPoll = useCallback(() => {
    if (historyPollTimer.current != null) {
      clearTimeout(historyPollTimer.current);
      historyPollTimer.current = null;
    }
  }, []);

  const scheduleHistoryPoll = useCallback(() => {
    // history:orders allows 6 requests/minute. Do not start another walk inside that window.
    // Two pages per poll. A book with many cancelled orders needs more than 10 polls
    // before older months exist; stopping early leaves the chart on the current month.
    if (historyPollCount.current >= 24) {
      setHistoryBackfillPaused(true);
      clearHistoryPoll();
      return;
    }
    historyPollCount.current += 1;
    clearHistoryPoll();
    historyPollTimer.current = setTimeout(() => {
      void loadValueHistoryRef.current({ poll: true });
    }, 60_000);
  }, [clearHistoryPoll]);

  const loadValueHistory = useCallback(async (opts?: { poll?: boolean; refresh?: boolean }) => {
    if (historyLoadInFlight.current) {
      if (!opts?.poll) {
        historyLoadQueued.current = true;
        if (opts?.refresh) historyRefreshQueued.current = true;
      }
      return;
    }
    historyLoadInFlight.current = true;
    if (!opts?.poll) {
      historyPollCount.current = 0;
      setHistoryBackfillPaused(false);
      clearHistoryPoll();
    }
    setValueHistoryLoading(true);
    try {
      const params = new URLSearchParams({ base: preferredPortfolioCurrency });
      if (opts?.refresh) params.set("refresh", "1");
      const res = await fetch(`/api/portfolio/value-history?${params.toString()}`);
      if (!res.ok) {
        if (opts?.poll) scheduleHistoryPoll();
        else setValueHistory(null);
        return;
      }
      const data = (await res.json()) as PortfolioValueHistoryPayload;
      setValueHistory(data);
      const morePending = data.historyStatus === "partial" && data.historyHasMore === true;
      if (morePending) {
        setHistoryBackfillPaused(false);
        scheduleHistoryPoll();
      } else if (data.historyStatus === "partial") {
        setHistoryBackfillPaused(true);
        clearHistoryPoll();
      } else {
        setHistoryBackfillPaused(false);
        historyPollCount.current = 0;
        clearHistoryPoll();
      }
    } catch {
      if (opts?.poll) scheduleHistoryPoll();
      else setValueHistory(null);
    } finally {
      setValueHistoryLoading(false);
      historyLoadInFlight.current = false;
      if (historyLoadQueued.current) {
        const refresh = historyRefreshQueued.current;
        historyLoadQueued.current = false;
        historyRefreshQueued.current = false;
        void loadValueHistoryRef.current(refresh ? { refresh: true } : undefined);
      }
    }
  }, [clearHistoryPoll, preferredPortfolioCurrency, scheduleHistoryPoll]);

  loadValueHistoryRef.current = loadValueHistory;

  useEffect(() => () => clearHistoryPoll(), [clearHistoryPoll]);

  const reloadDividendsFromCache = useCallback(() => {
    setDividendsReloadToken((n) => n + 1);
  }, []);

  const runSync = useCallback(async (opts?: { refreshHistory?: boolean }): Promise<boolean> => {
    setSyncing(true);
    setError(null);
    setPortfolioInfo(null);
    try {
      const res = await fetch("/api/trading212/sync", { method: "POST" });
      const data = (await res.json()) as {
        error?: string;
        skippedDueToManual?: string[];
        trading212Status?: number | null;
      };
      if (!res.ok) {
        const msg = normalizeTrading212ErrorMessage(data.error ?? "Sync failed") ?? "Sync failed";
        setLastSyncT212Status(
          typeof data.trading212Status === "number" ? data.trading212Status : null,
        );
        setError(msg);
        await load({ clearPageError: false });
        if (opts?.refreshHistory) await loadValueHistory({ refresh: true });
        return false;
      }
      setLastSyncT212Status(null);
      await load();
      await loadValueHistory(opts?.refreshHistory ? { refresh: true } : undefined);
      reloadDividendsFromCache();
      if (Array.isArray(data.skippedDueToManual) && data.skippedDueToManual.length > 0) {
        setPortfolioInfo(t("portfolio.syncSkippedManual", { symbols: data.skippedDueToManual.join(", ") }));
      }
      return true;
    } catch {
      setError(t("portfolio.syncNetworkError"));
      await load({ clearPageError: false });
      if (opts?.refreshHistory) await loadValueHistory({ refresh: true });
      return false;
    } finally {
      setSyncing(false);
    }
  }, [load, loadValueHistory, reloadDividendsFromCache, t]);

  const refreshPortfolioData = useCallback(async () => {
    if (trading212?.connected && trading212.encryptionConfigured) {
      await runSync({ refreshHistory: true });
      return;
    }
    await load();
    await loadValueHistory({ refresh: true });
    setDividendsLiveRefreshToken((n) => n + 1);
  }, [load, loadValueHistory, runSync, trading212?.connected, trading212?.encryptionConfigured]);

  useEffect(() => {
    if (status === "authenticated") {
      void load();
      void loadValueHistory();
    }
    else if (status === "unauthenticated") {
      setHoldings([]);
      setQuotes({});
      setTrading212(null);
      setError(null);
      setLoading(false);
    }
  }, [status, load, loadValueHistory]);

  const signedIn = status === "authenticated";

  async function onSaveT212(e: FormEvent) {
    e.preventDefault();
    if (!apiKey.trim() || !apiSecret.trim()) return;
    setSavingCreds(true);
    setError(null);
    try {
      const res = await fetch("/api/trading212/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          environment: t212Env,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
        }),
      });
      let message = t("portfolio.saveFailed");
      try {
        const data = (await res.json()) as { error?: string };
        if (data.error) message = data.error;
      } catch {
        if (!res.ok) message = `${res.status} ${res.statusText}`;
      }
      if (!res.ok) {
        setError(message);
        setTimeout(() => {
          document.getElementById("portfolio-page-error")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 0);
        return;
      }
      setApiKey("");
      setApiSecret("");
      await load();
      await runSync();
    } catch {
      setError(t("portfolio.saveNetworkError"));
    } finally {
      setSavingCreds(false);
    }
  }

  async function clearTrading212Integration(opts?: { confirmDisconnect?: boolean }) {
    if (opts?.confirmDisconnect && !window.confirm(t("portfolio.disconnectConfirm"))) return;
    setSavingCreds(true);
    setError(null);
    setLastSyncT212Status(null);
    try {
      const res = await fetch("/api/trading212/settings", { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t("portfolio.saveFailed"));
        return;
      }
      setApiKey("");
      setApiSecret("");
      await load();
      await loadValueHistory();
      reloadDividendsFromCache();
      setDividendsLiveRefreshToken((n) => n + 1);
    } catch {
      setError(t("portfolio.saveNetworkError"));
    } finally {
      setSavingCreds(false);
    }
  }

  async function onDisconnect() {
    await clearTrading212Integration({ confirmDisconnect: true });
  }

  async function onDismissTrading212() {
    await clearTrading212Integration({ confirmDisconnect: true });
  }

  function onReconnectTrading212FromDividends() {
    setPortfolioView("holdings");
    setTimeout(() => scrollToT212Settings(), 50);
  }

  function scrollToT212Settings() {
    document.getElementById("t212-settings")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onSync() {
    void runSync();
  }

  async function onSaveMonthlyValue(month: string, amount: string, currency: string) {
    setSavingMonthlyValue(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio/value-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, amount, currency }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? t("portfolio.valueManualSaveFailed"));
        return;
      }
      await loadValueHistory();
    } catch {
      setError(t("portfolio.valueManualSaveFailed"));
    } finally {
      setSavingMonthlyValue(false);
    }
  }

  async function onDeleteMonthlyValue(month: string) {
    setSavingMonthlyValue(true);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/value-history/${encodeURIComponent(month)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t("portfolio.valueManualDeleteFailed"));
        return;
      }
      await loadValueHistory();
    } catch {
      setError(t("portfolio.valueManualDeleteFailed"));
    } finally {
      setSavingMonthlyValue(false);
    }
  }

  async function onAddManual(e: FormEvent) {
    e.preventDefault();
    const s = sym.trim().toUpperCase();
    if (!s || !qty || !avg) return;
    setAdding(true);
    setPortfolioInfo(null);
    try {
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbolYahoo: s,
          quantity: qty,
          avgPrice: avg,
          currency: manualCurrency,
        }),
      });
      const data = (await res.json()) as { error?: string; replacedBrokerRow?: boolean };
      if (!res.ok) {
        setError(data.error ?? "Add failed");
        return;
      }
      setSym("");
      setQty("");
      setAvg("");
      await load();
      await loadValueHistory();
      reloadDividendsFromCache();
      if (data.replacedBrokerRow) {
        setPortfolioInfo(t("portfolio.manualReplacedBroker"));
      }
    } catch {
      setError(t("portfolio.saveNetworkError"));
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(id: string) {
    try {
      const res = await fetch(`/api/portfolio/holdings/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      await load();
      await loadValueHistory();
      reloadDividendsFromCache();
    } catch {
      setError(t("portfolio.saveNetworkError"));
    }
  }

  function startEdit(h: HoldingApi) {
    setEditingId(h.id);
    setEditQty(h.quantity);
    setEditAvg(h.avgPrice);
    setEditCurrency(normalizePortfolioCurrency(h.currency));
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/portfolio/holdings/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: editQty,
          avgPrice: editAvg,
          currency: editCurrency,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      setEditingId(null);
      await load();
      await loadValueHistory();
      reloadDividendsFromCache();
    } catch {
      setError(t("portfolio.saveNetworkError"));
    } finally {
      setSavingEdit(false);
    }
  }

  const rows = useMemo(() => {
    const mapped = holdings.map((h) => {
      const q = quotes[h.symbolYahoo] ?? quotes[h.symbolYahoo.trim().toUpperCase()] ?? null;
      const qQty = Number(h.quantity);
      const qAvg = Number(h.avgPrice);
      const holdingCcy = normalizePortfolioCurrency(h.currency);
      const quoteCcy = q ? normalizePortfolioCurrency(q.currency) : holdingCcy;
      const hasValidQuote = q != null && Number.isFinite(q.price) && q.price > 0;
      const priceInHolding =
        hasValidQuote && q
          ? convertPortfolioMoney(q.price, quoteCcy, holdingCcy, fx)
          : null;
      const mv =
        priceInHolding != null && Number.isFinite(priceInHolding) ? priceInHolding * qQty : null;
      const cost = qAvg * qQty;
      const pl = mv != null ? mv - cost : null;
      const plPct = cost > 0 && pl != null ? (pl / cost) * 100 : null;
      const fxMismatch = hasValidQuote && quoteCcy !== holdingCcy && priceInHolding == null;
      let estAnnual: number | null = null;
      if (hasValidQuote && q) {
        if (q.dividendRate != null && Number.isFinite(q.dividendRate)) {
          // Without FX rates the raw rate would be in the quote currency — show nothing instead.
          const rateInHolding = convertPortfolioMoney(q.dividendRate, quoteCcy, holdingCcy, fx);
          if (rateInHolding != null) estAnnual = rateInHolding * qQty;
        }
        if (
          estAnnual == null &&
          q.dividendYield != null &&
          Number.isFinite(q.dividendYield) &&
          mv != null &&
          mv > 0
        ) {
          estAnnual = mv * q.dividendYield;
        }
      }
      return {
        h,
        q,
        qQty,
        qAvg,
        holdingCcy,
        quoteCcy,
        priceInHolding,
        mv,
        cost,
        pl,
        plPct,
        estAnnual,
        fxMismatch,
      };
    });
    return mapped.sort((a, b) => (b.mv ?? -1) - (a.mv ?? -1));
  }, [holdings, quotes, fx]);

  const analyticsRows = useMemo<AnalyticsRow[]>(
    () =>
      rows.map(({ h, q, mv, cost, pl, estAnnual, holdingCcy }) => ({
        symbol: h.symbolYahoo,
        name: q?.name ?? null,
        sector: q?.sector ?? null,
        holdingCcy,
        mv,
        cost,
        pl,
        estAnnual,
        dayChangePct:
          q && !q.fromBroker && Number.isFinite(q.changePercent) ? q.changePercent : null,
      })),
    [rows],
  );

  const holdingSymbols = useMemo(
    () => [...new Set(holdings.map((h) => h.symbolYahoo.trim().toUpperCase()).filter(Boolean))],
    [holdings],
  );

  const dipHistoryMappings = useMemo(
    () =>
      buildDipHistorySymbolMappings(holdingSymbols, (key) => quotes[key]?.resolvedYahooSymbol ?? null),
    [holdingSymbols, quotes],
  );

  const dipHistoryFetchSymbols = useMemo(
    () => [...new Set(dipHistoryMappings.map((m) => m.yahooSymbol))],
    [dipHistoryMappings],
  );

  useEffect(() => {
    if (dipHistoryFetchSymbols.length === 0) {
      setDipHistory({});
      return;
    }
    let cancelled = false;
    const q = `/api/quotes/history?symbols=${encodeURIComponent(dipHistoryFetchSymbols.join(","))}`;
    void fetch(q)
      .then(async (res) => {
        const data = (await res.json()) as { history?: Record<string, QuoteHistoryBar[]> };
        if (cancelled || !res.ok) return;
        const quotePrices: Record<string, number | null | undefined> = {};
        for (const { portfolioKey } of dipHistoryMappings) {
          quotePrices[portfolioKey] = quotes[portfolioKey]?.price;
        }
        setDipHistory(remapPortfolioDipHistory(data.history ?? {}, dipHistoryMappings, quotePrices));
      })
      .catch(() => {
        if (!cancelled) setDipHistory({});
      });
    return () => {
      cancelled = true;
    };
  }, [dipHistoryFetchSymbols, dipHistoryMappings, quotes]);

  const dipQuotes = useMemo(
    () =>
      holdingSymbols.flatMap((sym) => {
        const q = quotes[sym];
        if (!q) return [];
        return [
          {
            symbol: sym,
            name: q.name,
            price: q.price,
            dipVsSma200Pct: q.dipVsSma200Pct,
            twoHundredDayAverage: q.twoHundredDayAverage,
          },
        ];
      }),
    [holdingSymbols, quotes],
  );


  const analytics = usePortfolioAnalytics(analyticsRows, fx);

  const t212AuthFailure = useMemo(
    () =>
      isTrading212AuthFailure(lastSyncT212Status, trading212?.lastError ?? error) ||
      isTrading212AuthFailure(null, trading212?.lastError) ||
      isTrading212AuthFailure(null, error),
    [lastSyncT212Status, trading212?.lastError, error],
  );

  const t212AuthIssueDisplay = useMemo(() => {
    if (!t212AuthFailure) return null;
    const raw =
      trading212?.lastError ??
      (error && looksLikeTrading212ErrorMessage(error) ? error : null);
    if (raw) {
      return normalizeTrading212ErrorMessage(raw) ?? t("portfolio.t212ConnectionProblemGeneric");
    }
    return t("portfolio.t212ConnectionProblemGeneric");
  }, [t212AuthFailure, trading212?.lastError, error, t]);

  const t212BrokerNotice = useMemo(() => {
    if (t212AuthFailure) return null;
    const raw =
      trading212?.lastError ??
      (error && looksLikeTrading212ErrorMessage(error) ? error : null);
    if (!raw || !looksLikeTrading212ErrorMessage(raw)) return null;
    return normalizeTrading212ErrorMessage(raw) ?? raw;
  }, [t212AuthFailure, trading212?.lastError, error]);

  const genericPageError =
    error && !looksLikeTrading212ErrorMessage(error) ? error : null;

  if (status === "loading") {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("portfolio.loading")}
      </div>
    );
  }

  if (!signedIn) {
    return (
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle>{t("portfolio.signInTitle")}</CardTitle>
          <CardDescription>{t("portfolio.signInDesc")}</CardDescription>
          <Link href="/login" className={buttonVariants({ variant: "default", className: "mt-2 w-fit" })}>
            {t("portfolio.signInCta")}
          </Link>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Tabs
      className="gap-6 sm:gap-8"
      value={portfolioView}
      onValueChange={(v) => setPortfolioView(v === "dividends" ? "dividends" : "holdings")}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:gap-x-4">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {t("portfolio.title")}
        </h1>
        <TabsList className="w-fit">
          <TabsTrigger className="flex-none px-4" value="holdings">
            {t("portfolio.tabHoldings")}
          </TabsTrigger>
          <TabsTrigger className="flex-none px-4" value="dividends">
            {t("portfolio.tabDividends")}
          </TabsTrigger>
        </TabsList>
        <Button
          type="button"
          variant="outline"
          className="shrink-0 border-border"
          onClick={() => void refreshPortfolioData()}
          disabled={loading || syncing}
          aria-busy={loading || syncing}
        >
          <RefreshCw className={cn("mr-2 size-4", (loading || syncing) && "animate-spin")} aria-hidden />
          {t("portfolio.refreshData")}
        </Button>
      </div>

      <TabsContent value="holdings" className="space-y-6 sm:space-y-8">
      {t212AuthFailure && t212AuthIssueDisplay ? (
        <div
          id="portfolio-page-error"
          className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-950/35 px-4 py-3 text-sm text-amber-50/95 sm:flex-row sm:items-start sm:justify-between"
          role="alert"
        >
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-amber-100">{t("portfolio.t212ConnectionProblemTitle")}</p>
            <p className="leading-relaxed text-amber-50/90">{t212AuthIssueDisplay}</p>
            <p className="text-xs text-amber-100/80">{t("portfolio.t212ConnectionProblemHint")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={scrollToT212Settings}>
              {t("portfolio.t212ReconnectCta")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-amber-500/40 bg-transparent hover:bg-amber-950/60"
              disabled={savingCreds}
              onClick={() => void onDismissTrading212()}
            >
              {t("portfolio.t212Dismiss")}
            </Button>
          </div>
        </div>
      ) : null}

      {t212BrokerNotice ? (
        <div
          className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          role="status"
        >
          <p className="font-medium text-foreground">{t("portfolio.t212BrokerNoticeTitle")}</p>
          <p className="mt-1 leading-relaxed">{t212BrokerNotice}</p>
        </div>
      ) : null}

      {genericPageError ? (
        <p id="portfolio-page-error" className="text-sm text-red-400" role="alert">
          {genericPageError}
        </p>
      ) : null}

      {portfolioInfo ? (
        <p className="text-sm text-emerald-400/90" role="status">
          {portfolioInfo}
        </p>
      ) : null}

      {trading212?.connected &&
      trading212.encryptionConfigured &&
      !trading212.lastSyncAt &&
      !trading212.lastError ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-amber-500/35 bg-amber-950/35 px-4 py-3 text-sm text-amber-50/95 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <p className="min-w-0 flex-1 leading-relaxed">{t("portfolio.syncNeededHint")}</p>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 border-amber-500/40 bg-amber-950/50 hover:bg-amber-900/50"
            disabled={syncing || savingCreds}
            onClick={() => void runSync()}
          >
            {syncing ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                {t("portfolio.syncing")}
              </>
            ) : (
              t("portfolio.syncNow")
            )}
          </Button>
        </div>
      ) : null}

      {analytics ? (
        <div className="space-y-4">
          <PortfolioSummarySection analytics={analytics} />
          <PortfolioAllocationSection analytics={analytics} />
        </div>
      ) : null}

      <PortfolioValueChartCard
        data={valueHistory}
        loading={valueHistoryLoading}
        backfillPaused={historyBackfillPaused}
      />

      {loading && holdings.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("portfolio.loading")}
        </div>
      ) : holdings.length === 0 ? (
        <Card className="border-dashed border-border bg-transparent">
          <CardHeader>
            <CardTitle className="text-base">{t("portfolio.emptyTitle")}</CardTitle>
            <CardDescription>{t("portfolio.emptyDesc")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="-mx-4 rounded-lg border border-border sm:mx-0">
          <Table className="min-w-[36rem] sm:min-w-[44rem] md:min-w-full">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="hidden lg:table-cell">{t("portfolio.colSource")}</TableHead>
                <TableHead>{t("portfolio.colSymbol")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colQty")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colAvg")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colPrice")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colValue")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t("portfolio.colCost")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colPl")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colPlPct")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t("portfolio.colDivYld")}</TableHead>
                <TableHead className="hidden text-right md:table-cell">{t("portfolio.colExpDiv")}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t("portfolio.colDip")}</TableHead>
                <TableHead className="hidden text-right lg:table-cell">{t("portfolio.colEarnings")}</TableHead>
                <TableHead className="w-[100px] sm:w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ h, q, qQty, holdingCcy, mv, cost, pl, plPct, estAnnual, fxMismatch, priceInHolding }) => (
                <TableRow key={h.id} className="border-border">
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {h.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex min-w-0 max-w-[14rem] flex-col gap-0.5 sm:max-w-none">
                      <CompanyIdentity
                        symbol={h.symbolYahoo}
                        name={q?.name}
                        href={`/stock/${encodeURIComponent(q?.resolvedYahooSymbol ?? h.symbolYahoo)}`}
                        size="sm"
                        primaryLabel="name"
                      />
                      <span className="text-xs text-muted-foreground lg:hidden">
                        {h.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {editingId === h.id && h.source === "manual" ? (
                      <Input
                        className="h-8 border-border bg-background"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                      />
                    ) : (
                      qQty.toLocaleString(undefined, { maximumFractionDigits: 6 })
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {editingId === h.id && h.source === "manual" ? (
                      <Input
                        className="h-8 border-border bg-background"
                        value={editAvg}
                        onChange={(e) => setEditAvg(e.target.value)}
                      />
                    ) : (
                      fmtMoney(Number(h.avgPrice), holdingCcy)
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {priceInHolding != null
                      ? fmtMoney(priceInHolding, holdingCcy)
                      : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {mv != null ? fmtMoney(mv, holdingCcy) : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {fmtMoney(cost, holdingCcy)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      pl != null && pl > 0 ? "text-emerald-400" : pl != null && pl < 0 ? "text-red-400" : "",
                    )}
                  >
                    {pl != null ? fmtMoney(pl, holdingCcy) : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      plPct != null && plPct > 0
                        ? "text-emerald-400"
                        : plPct != null && plPct < 0
                          ? "text-red-400"
                          : "",
                    )}
                  >
                    {fxMismatch
                      ? t("portfolio.fxUnavailable")
                      : plPct != null
                        ? formatPercent(plPct)
                        : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                    {formatDividendYieldPercent(q?.dividendYield ?? null)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {estAnnual != null ? fmtMoney(estAnnual, holdingCcy) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "hidden text-right font-mono text-xs tabular-nums lg:table-cell",
                      q?.dipVsSma200Pct != null && q.dipVsSma200Pct < 0
                        ? "text-red-400"
                        : q?.dipVsSma200Pct != null && q.dipVsSma200Pct > 0
                          ? "text-emerald-400"
                          : "text-muted-foreground",
                    )}
                    title={t("portfolio.dipHint")}
                  >
                    {q?.dipVsSma200Pct != null && Number.isFinite(q.dipVsSma200Pct)
                      ? formatPercent(q.dipVsSma200Pct)
                      : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right text-xs tabular-nums lg:table-cell">
                    {q?.nextEarnings ? (
                      <span className={cn(isEarningsSoon(q.nextEarnings) ? "text-amber-400" : "text-muted-foreground")}>
                        {formatLocaleDateShort(q.nextEarnings, locale, dateFormat)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {editingId === h.id ? (
                        <form onSubmit={onSaveEdit} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          <select
                            value={editCurrency}
                            onChange={(e) => setEditCurrency(e.target.value)}
                            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
                            aria-label={t("portfolio.manualCurrency")}
                          >
                            {MANUAL_CURRENCIES.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          <Button type="submit" size="sm" variant="secondary" disabled={savingEdit}>
                            {savingEdit ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                            {t("portfolio.manualSave")}
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            {t("portfolio.manualCancel")}
                          </Button>
                        </form>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            aria-label={t("portfolio.manualEdit")}
                            onClick={() => startEdit(h)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          {h.source === "manual" ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-8 text-red-400 hover:text-red-300"
                              aria-label={t("portfolio.manualDelete")}
                              onClick={() => void onDelete(h.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {holdings.length > 0 ? (
        <div className="rounded-lg border border-border px-4 py-4">
          <DipFinderPanel quotes={dipQuotes} history={dipHistory} compact />
        </div>
      ) : null}

      {analytics ? <PortfolioMoversSection analytics={analytics} /> : null}

      <Card className="border-border bg-card">
        <CardHeader className="space-y-1 pb-2 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">{t("portfolio.manualTitle")}</CardTitle>
        </CardHeader>
        <form
          onSubmit={onAddManual}
          className="grid grid-cols-1 gap-3 px-4 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-5"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="m-sym">{t("portfolio.manualSymbol")}</Label>
            <Input
              id="m-sym"
              value={sym}
              onChange={(e) => {
                const v = e.target.value;
                setSym(v);
                const listing = listingCurrencyOverride(v);
                if (listing) setManualCurrency(listing);
              }}
              className="border-border bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-qty">{t("portfolio.manualQty")}</Label>
            <Input
              id="m-qty"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="border-border bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-avg">{t("portfolio.manualAvg")}</Label>
            <Input
              id="m-avg"
              inputMode="decimal"
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
              className="border-border bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-ccy">{t("portfolio.manualCurrency")}</Label>
            <select
              id="m-ccy"
              value={manualCurrency}
              onChange={(e) => setManualCurrency(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {MANUAL_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={adding} className="w-full sm:w-auto">
              {adding ? <Loader2 className="size-4 animate-spin" /> : t("portfolio.manualAdd")}
            </Button>
          </div>
        </form>
      </Card>

      <PortfolioManualMonthlyValueCard
        data={valueHistory}
        saving={savingMonthlyValue}
        onSubmit={onSaveMonthlyValue}
        onDelete={onDeleteMonthlyValue}
      />

      <Card
        id="t212-settings"
        className={cn(
          "border-border bg-card",
          t212AuthFailure && "border-amber-500/40 ring-1 ring-amber-500/20",
        )}
      >
        <CardHeader className="space-y-2">
          <CardTitle className="text-base sm:text-lg">{t("portfolio.t212Title")}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            {t("portfolio.t212Desc")}{" "}
            <a
              href="https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline-offset-4 hover:underline"
            >
              {t("portfolio.t212Docs")}
            </a>
          </CardDescription>
        </CardHeader>
        <div className="space-y-4 px-4 pb-6 sm:px-6">
          {trading212?.encryptionConfigured === false ? (
            <p className="text-sm text-amber-400">{t("portfolio.encryptionOff")}</p>
          ) : null}

          <form onSubmit={onSaveT212} className="flex max-w-lg flex-col gap-3">
            <div className="grid gap-2">
              <Label htmlFor="t212-env">{t("portfolio.envLabel")}</Label>
              <select
                id="t212-env"
                value={t212Env}
                onChange={(e) => setT212Env(e.target.value === "live" ? "live" : "demo")}
                className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="demo">{t("portfolio.envDemo")}</option>
                <option value="live">{t("portfolio.envLive")}</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t212-key">{t("portfolio.apiKey")}</Label>
              <Input
                id="t212-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="border-border bg-background"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="t212-secret">{t("portfolio.apiSecret")}</Label>
              <Input
                id="t212-secret"
                type="password"
                autoComplete="off"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="border-border bg-background"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={savingCreds || trading212?.encryptionConfigured === false}>
                {savingCreds ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {trading212?.connected ? t("portfolio.saveCreds") : t("portfolio.connectCreds")}
                  </>
                ) : trading212?.connected ? (
                  t("portfolio.saveCreds")
                ) : (
                  t("portfolio.connectCreds")
                )}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!trading212?.connected || syncing || savingCreds}
                onClick={() => void onSync()}
              >
                {syncing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("portfolio.syncing")}
                  </>
                ) : (
                  t("portfolio.syncNow")
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!trading212?.connected || savingCreds}
                onClick={() => void onDisconnect()}
              >
                {t("portfolio.disconnect")}
              </Button>
            </div>
          </form>

          {trading212?.connected ? (
            <p className="text-xs text-muted-foreground">
              {trading212.lastSyncAt
                ? t("portfolio.lastSync", {
                    time: new Date(trading212.lastSyncAt).toLocaleString(
                      resolveDateLocaleTag(locale, dateFormat),
                      { dateStyle: "short", timeStyle: "short" },
                    ),
                  })
                : t("portfolio.neverSynced")}
              {trading212.lastError
                ? ` · ${t("portfolio.syncError", {
                    msg: normalizeTrading212ErrorMessage(trading212.lastError) ?? trading212.lastError,
                  })}`
                : null}
            </p>
          ) : null}
        </div>
      </Card>
        </TabsContent>

        <TabsContent value="dividends">
          <PortfolioDividendsView
            reloadToken={dividendsReloadToken}
            liveRefreshToken={dividendsLiveRefreshToken}
            onReconnectTrading212={onReconnectTrading212FromDividends}
            onDismissTrading212={() => void onDismissTrading212()}
          />
        </TabsContent>
    </Tabs>
  );
}
