"use client";

import { ChevronDown, Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDecimalAsPercent, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { PortfolioQuoteRow } from "@/lib/portfolioMarketData";
import { cn } from "@/lib/utils";

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

export function PortfolioClient() {
  const { t } = useI18n();
  const { status } = useSession();
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

  const [sym, setSym] = useState("");
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState("");
  const [editAvg, setEditAvg] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  /** Non-error info (e.g. per-symbol sync skip or manual replacing broker row). */
  const [portfolioInfo, setPortfolioInfo] = useState<string | null>(null);

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
        trading212?: Trading212Api;
        error?: string;
      };

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

  const runSync = useCallback(async (): Promise<boolean> => {
    setSyncing(true);
    setError(null);
    setPortfolioInfo(null);
    try {
      const res = await fetch("/api/trading212/sync", { method: "POST" });
      const data = (await res.json()) as { error?: string; skippedDueToManual?: string[] };
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        await load({ clearPageError: false });
        return false;
      }
      await load();
      if (Array.isArray(data.skippedDueToManual) && data.skippedDueToManual.length > 0) {
        setPortfolioInfo(t("portfolio.syncSkippedManual", { symbols: data.skippedDueToManual.join(", ") }));
      }
      return true;
    } catch {
      setError(t("portfolio.syncNetworkError"));
      await load({ clearPageError: false });
      return false;
    } finally {
      setSyncing(false);
    }
  }, [load, t]);

  useEffect(() => {
    if (status === "authenticated") void load();
    else if (status === "unauthenticated") {
      setHoldings([]);
      setQuotes({});
      setTrading212(null);
      setError(null);
      setLoading(false);
    }
  }, [status, load]);

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

  async function onDisconnect() {
    if (!window.confirm(t("portfolio.disconnectConfirm"))) return;
    setSavingCreds(true);
    try {
      await fetch("/api/trading212/settings", { method: "DELETE" });
      await load();
    } finally {
      setSavingCreds(false);
    }
  }

  function onSync() {
    void runSync();
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
        body: JSON.stringify({ symbolYahoo: s, quantity: qty, avgPrice: avg }),
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
      if (data.replacedBrokerRow) {
        setPortfolioInfo(t("portfolio.manualReplacedBroker"));
      }
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(id: string) {
    const res = await fetch(`/api/portfolio/holdings/${id}`, { method: "DELETE" });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(data.error ?? "Delete failed");
      return;
    }
    await load();
  }

  function startEdit(h: HoldingApi) {
    setEditingId(h.id);
    setEditQty(h.quantity);
    setEditAvg(h.avgPrice);
  }

  async function onSaveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/portfolio/holdings/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: editQty, avgPrice: editAvg }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Update failed");
        return;
      }
      setEditingId(null);
      await load();
    } finally {
      setSavingEdit(false);
    }
  }

  const rows = useMemo(() => {
    return holdings.map((h) => {
      const q = quotes[h.symbolYahoo];
      const qQty = Number(h.quantity);
      const qAvg = Number(h.avgPrice);
      const hasValidQuote = q != null && Number.isFinite(q.price) && q.price > 0;
      const mv = hasValidQuote ? q.price * qQty : null;
      const cost = qAvg * qQty;
      const pl = mv != null ? mv - cost : null;
      const plPct = cost > 0 && pl != null ? (pl / cost) * 100 : null;
      let estAnnual: number | null = null;
      if (hasValidQuote && q) {
        if (q.dividendRate != null && Number.isFinite(q.dividendRate)) {
          estAnnual = q.dividendRate * qQty;
        } else if (q.dividendYield != null && Number.isFinite(q.dividendYield) && mv != null && mv > 0) {
          estAnnual = mv * q.dividendYield;
        }
      }
      return { h, q, qQty, qAvg, mv, cost, pl, plPct, estAnnual };
    });
  }, [holdings, quotes]);

  /** Sums est. annual dividend by holding currency (same basis as table column). */
  const dividendTotalsByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const { h, estAnnual } of rows) {
      if (estAnnual == null || !Number.isFinite(estAnnual) || estAnnual <= 0) continue;
      const c =
        typeof h.currency === "string" && h.currency.trim().length >= 3
          ? h.currency.trim().toUpperCase().slice(0, 8)
          : "USD";
      map.set(c, (map.get(c) ?? 0) + estAnnual);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

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
      <Card className="border-white/10 bg-zinc-900/50">
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
    <div className="space-y-6 sm:space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t("portfolio.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t("portfolio.subtitle")}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full shrink-0 border-white/15 sm:w-auto"
          onClick={() => void load()}
          disabled={loading}
          aria-busy={loading}
        >
          <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} aria-hidden />
          {t("portfolio.refreshData")}
        </Button>
      </div>

      {error ? (
        <p id="portfolio-page-error" className="text-sm text-red-400" role="alert">
          {error}
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

      <Card className="border-white/10 bg-zinc-900/50">
        <CardHeader className="space-y-1 pb-2 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">{t("portfolio.manualTitle")}</CardTitle>
        </CardHeader>
        <form onSubmit={onAddManual} className="grid grid-cols-1 gap-3 px-4 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <Label htmlFor="m-sym">{t("portfolio.manualSymbol")}</Label>
            <Input
              id="m-sym"
              value={sym}
              onChange={(e) => setSym(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-qty">{t("portfolio.manualQty")}</Label>
            <Input
              id="m-qty"
              inputMode="decimal"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="m-avg">{t("portfolio.manualAvg")}</Label>
            <Input
              id="m-avg"
              inputMode="decimal"
              value={avg}
              onChange={(e) => setAvg(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={adding} className="w-full sm:w-auto">
              {adding ? <Loader2 className="size-4 animate-spin" /> : t("portfolio.manualAdd")}
            </Button>
          </div>
        </form>
      </Card>

      <p className="text-xs text-muted-foreground">{t("portfolio.divDisclaimer")}</p>

      {holdings.length > 0 ? (
        <Card className="border border-emerald-500/25 bg-emerald-950/25">
          <CardHeader className="space-y-1.5 px-4 pb-2 sm:px-6">
            <CardTitle className="text-base leading-snug sm:text-lg">{t("portfolio.dividendSummaryTitle")}</CardTitle>
            <CardDescription className="text-xs leading-relaxed sm:text-sm">
              {t("portfolio.dividendSummaryHint")}
            </CardDescription>
          </CardHeader>
          <div className="px-4 pb-6 sm:px-6">
            {dividendTotalsByCurrency.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("portfolio.dividendNoData")}</p>
            ) : (
              <div className="flex flex-wrap gap-6 sm:gap-8">
                {dividendTotalsByCurrency.map(([currency, sum]) => (
                  <div key={currency}>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {currency} · {t("portfolio.dividendPerYearLabel")}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums tracking-tight text-emerald-400 sm:text-2xl">
                      {fmtMoney(sum, currency)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      ) : null}

      {loading && holdings.length === 0 ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("portfolio.loading")}
        </div>
      ) : holdings.length === 0 ? (
        <Card className="border-dashed border-white/15 bg-transparent">
          <CardHeader>
            <CardTitle className="text-base">{t("portfolio.emptyTitle")}</CardTitle>
            <CardDescription>{t("portfolio.emptyDesc")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="-mx-4 rounded-lg border border-white/10 sm:mx-0">
          <Table className="min-w-[36rem] sm:min-w-[44rem] md:min-w-full">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
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
                <TableHead className="w-[100px] sm:w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ h, q, qQty, mv, cost, pl, plPct, estAnnual }) => (
                <TableRow key={h.id} className="border-white/10">
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {h.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex min-w-0 max-w-[11rem] flex-col gap-0.5 sm:max-w-none">
                      <span>
                        <Link
                          href={`/stock/${encodeURIComponent(q?.resolvedYahooSymbol ?? h.symbolYahoo)}`}
                          className="text-emerald-400 hover:underline"
                        >
                          {h.symbolYahoo}
                        </Link>
                        {h.symbolT212 ? (
                          <span className="ml-1 text-xs text-muted-foreground">({h.symbolT212})</span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground lg:hidden">
                        {h.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {editingId === h.id ? (
                      <Input
                        className="h-8 border-white/10 bg-zinc-950"
                        value={editQty}
                        onChange={(e) => setEditQty(e.target.value)}
                      />
                    ) : (
                      qQty.toLocaleString(undefined, { maximumFractionDigits: 6 })
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {editingId === h.id ? (
                      <Input
                        className="h-8 border-white/10 bg-zinc-950"
                        value={editAvg}
                        onChange={(e) => setEditAvg(e.target.value)}
                      />
                    ) : (
                      fmtMoney(Number(h.avgPrice), h.currency)
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {q && Number.isFinite(q.price) && q.price > 0
                      ? fmtMoney(q.price, q.currency)
                      : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {mv != null ? fmtMoney(mv, h.currency) : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {fmtMoney(cost, h.currency)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      pl != null && pl > 0 ? "text-emerald-400" : pl != null && pl < 0 ? "text-red-400" : "",
                    )}
                  >
                    {pl != null ? fmtMoney(pl, h.currency) : t("portfolio.quoteMissing")}
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
                    {plPct != null ? formatPercent(plPct) : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground md:table-cell">
                    {q?.dividendYield != null ? formatDecimalAsPercent(q.dividendYield) : "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums text-muted-foreground md:table-cell">
                    {estAnnual != null ? fmtMoney(estAnnual, h.currency) : "—"}
                  </TableCell>
                  <TableCell>
                    {h.source === "manual" ? (
                      <div className="flex gap-1">
                        {editingId === h.id ? (
                          <form onSubmit={onSaveEdit} className="flex flex-wrap items-center gap-1">
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
                          </>
                        )}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <details className="group rounded-xl border border-white/10 bg-zinc-900/50 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium tracking-tight text-foreground hover:bg-white/5 sm:px-6 sm:py-4 sm:text-base">
          <span>{t("portfolio.t212Title")}</span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <div className="space-y-4 border-t border-white/10 px-4 pb-6 pt-2 sm:px-6">
          <p className="text-sm text-muted-foreground">
            {t("portfolio.t212Desc")}{" "}
            <a
              href="https://helpcentre.trading212.com/hc/en-us/articles/14584770928157-Trading-212-API-key"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline-offset-4 hover:underline"
            >
              {t("portfolio.t212Docs")}
            </a>
          </p>
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
                className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-foreground"
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
                className="border-white/10 bg-zinc-950"
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
                className="border-white/10 bg-zinc-950"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={savingCreds}>
                {savingCreds ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t("portfolio.saveCreds")}
                  </>
                ) : (
                  t("portfolio.saveCreds")
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
                    time: new Date(trading212.lastSyncAt).toLocaleString(),
                  })
                : t("portfolio.neverSynced")}
              {trading212.lastError
                ? ` · ${t("portfolio.syncError", { msg: trading212.lastError })}`
                : null}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
