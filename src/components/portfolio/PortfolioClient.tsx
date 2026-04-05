"use client";

import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/portfolio");
      if (res.status === 401) {
        setHoldings([]);
        setQuotes({});
        setTrading212(null);
        setError(null);
        return;
      }
      const data = (await res.json()) as {
        holdings?: HoldingApi[];
        quotes?: Record<string, PortfolioQuoteRow | null>;
        trading212?: Trading212Api;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? t("portfolio.errorLoad"));
        return;
      }
      setHoldings(data.holdings ?? []);
      setQuotes(data.quotes ?? {});
      const t12 = data.trading212 ?? null;
      setTrading212(t12);
      if (t12?.environment) setT212Env(t12.environment);
    } catch {
      setError(t("portfolio.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        return;
      }
      setApiKey("");
      setApiSecret("");
      await load();
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

  async function onSync() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/trading212/sync", { method: "POST" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Sync failed");
        return;
      }
      await load();
    } finally {
      setSyncing(false);
    }
  }

  async function onAddManual(e: FormEvent) {
    e.preventDefault();
    const s = sym.trim().toUpperCase();
    if (!s || !qty || !avg) return;
    setAdding(true);
    try {
      const res = await fetch("/api/portfolio/holdings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbolYahoo: s, quantity: qty, avgPrice: avg }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Add failed");
        return;
      }
      setSym("");
      setQty("");
      setAvg("");
      await load();
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
      const price = q?.price ?? 0;
      const mv = price * qQty;
      const cost = qAvg * qQty;
      const pl = mv - cost;
      const plPct = cost > 0 ? (pl / cost) * 100 : 0;
      let estAnnual: number | null = null;
      if (q) {
        if (q.dividendRate != null && Number.isFinite(q.dividendRate)) {
          estAnnual = q.dividendRate * qQty;
        } else if (q.dividendYield != null && Number.isFinite(q.dividendYield) && mv > 0) {
          estAnnual = mv * q.dividendYield;
        }
      }
      return { h, q, qQty, qAvg, mv, cost, pl, plPct, estAnnual };
    });
  }, [holdings, quotes]);

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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("portfolio.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("portfolio.subtitle")}</p>
      </div>

      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}

      <Card className="border-white/10 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("portfolio.t212Title")}</CardTitle>
          <CardDescription>
            {t("portfolio.t212Desc")}{" "}
            <a
              href="https://docs.trading212.com/api"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 underline-offset-4 hover:underline"
            >
              {t("portfolio.t212Docs")}
            </a>
          </CardDescription>
        </CardHeader>
        <div className="space-y-4 px-6 pb-6">
          {trading212 && !trading212.encryptionConfigured ? (
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
              <Button type="submit" disabled={savingCreds || !trading212?.encryptionConfigured}>
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
      </Card>

      <Card className="border-white/10 bg-zinc-900/50">
        <CardHeader>
          <CardTitle>{t("portfolio.manualTitle")}</CardTitle>
        </CardHeader>
        <form onSubmit={onAddManual} className="grid gap-3 px-6 pb-6 sm:grid-cols-4">
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

      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">{t("portfolio.divDisclaimer")}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("mr-2 size-4", loading && "animate-spin")} />
          {t("portfolio.refresh")}
        </Button>
      </div>

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
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <Table>
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead>{t("portfolio.colSource")}</TableHead>
                <TableHead>{t("portfolio.colSymbol")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colQty")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colAvg")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colPrice")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colValue")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colCost")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colPl")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colPlPct")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colDivYld")}</TableHead>
                <TableHead className="text-right">{t("portfolio.colExpDiv")}</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ h, q, qQty, mv, cost, pl, plPct, estAnnual }) => (
                <TableRow key={h.id} className="border-white/10">
                  <TableCell className="text-muted-foreground">
                    {h.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link href={`/stock/${encodeURIComponent(h.symbolYahoo)}`} className="text-emerald-400 hover:underline">
                      {h.symbolYahoo}
                    </Link>
                    {h.symbolT212 ? (
                      <span className="ml-1 text-xs text-muted-foreground">({h.symbolT212})</span>
                    ) : null}
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
                    {q ? fmtMoney(q.price, q.currency) : t("portfolio.quoteMissing")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(mv, h.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMoney(cost, h.currency)}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      pl > 0 ? "text-emerald-400" : pl < 0 ? "text-red-400" : "",
                    )}
                  >
                    {fmtMoney(pl, h.currency)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums",
                      plPct > 0 ? "text-emerald-400" : plPct < 0 ? "text-red-400" : "",
                    )}
                  >
                    {formatPercent(plPct)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {q?.dividendYield != null ? formatDecimalAsPercent(q.dividendYield) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
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
    </div>
  );
}
