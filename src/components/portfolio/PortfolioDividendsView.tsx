"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { GrowthPillsRow } from "@/components/stock/GrowthPillsRow";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { periodizeAnnualDividend } from "@/lib/dividendEstimate";
import { formatDecimalAsPercent, formatDividendYieldPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { PortfolioDividendsPayload } from "@/lib/portfolioDividends";

const MANUAL_CURRENCIES = ["EUR", "USD", "GBP"] as const;

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

function formatMonthLabel(month: string, locale: string): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US", {
    month: "short",
    year: "2-digit",
  });
}

type PortfolioDividendsViewProps = {
  reloadToken?: number;
  liveRefreshToken?: number;
};

export function PortfolioDividendsView({
  reloadToken = 0,
  liveRefreshToken = 0,
}: PortfolioDividendsViewProps) {
  const { t, locale } = useI18n();
  const [data, setData] = useState<PortfolioDividendsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialLoadDone = useRef(false);

  const [ticker, setTicker] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [note, setNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const url = forceRefresh ? "/api/portfolio/dividends?refresh=1" : "/api/portfolio/dividends";
        const res = await fetch(url);
        if (res.status === 401) {
          setData(null);
          return;
        }
        const json = (await res.json()) as PortfolioDividendsPayload & { error?: string };
        if (!res.ok) {
          setError(json.error ?? t("portfolioDividends.errorLoad"));
          setData(null);
          return;
        }
        setData(json);
      } catch {
        setError(t("portfolioDividends.errorLoad"));
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    void load(false);
    initialLoadDone.current = true;
  }, [load]);

  useEffect(() => {
    if (!initialLoadDone.current || reloadToken === 0) return;
    void load(false);
  }, [reloadToken, load]);

  useEffect(() => {
    if (!initialLoadDone.current || liveRefreshToken === 0) return;
    void load(true);
  }, [liveRefreshToken, load]);

  const pillLabels = useMemo(
    () => ({
      oneYear: t("chartsFund.pill1Y"),
      twoYear: t("chartsFund.pill2Y"),
      threeYear: t("chartsFund.pill3Y"),
      fourYear: t("chartsFund.pill4Y"),
    }),
    [t],
  );

  const chartData = useMemo(() => {
    if (!data?.chartSeries.length) return [];
    return data.chartSeries
      .filter((p) => p.income != null && Number.isFinite(p.income))
      .map((p) => ({
        month: formatMonthLabel(p.month, locale),
        income: p.income as number,
        rawMonth: p.month,
      }));
  }, [data, locale]);

  async function onDeleteManual(id: string) {
    if (!window.confirm(t("portfolioDividends.deleteConfirm"))) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/portfolio/dividends/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? t("portfolioDividends.deleteFailed"));
        return;
      }
      await load(false);
    } catch {
      setError(t("portfolio.saveNetworkError"));
    } finally {
      setDeletingId(null);
    }
  }

  async function onAddManual(e: FormEvent) {
    e.preventDefault();
    const sym = ticker.trim().toUpperCase();
    if (!sym || !amount || !paidOn) return;
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/portfolio/dividends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: sym,
          symbolYahoo: sym,
          amount,
          paidOn,
          currency,
          note: note.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setAddError(body.error ?? t("portfolioDividends.addFailed"));
        return;
      }
      setTicker("");
      setAmount("");
      setPaidOn("");
      setNote("");
      await load(false);
    } catch {
      setAddError(t("portfolio.saveNetworkError"));
    } finally {
      setAdding(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("portfolio.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-red-400" role="alert">
        {error}
      </p>
    );
  }

  if (!data) return null;

  const hasPositions = data.positions.length > 0;
  const hasPayments = data.payments.length > 0;

  return (
    <div className="relative space-y-6 sm:space-y-8">
      {loading && data ? (
        <div className="absolute inset-x-0 top-0 z-10 flex justify-center pt-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-zinc-900/90 px-3 py-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {t("portfolio.loading")}
          </span>
        </div>
      ) : null}
      {data.trading212.error ? (
        <p className="text-sm text-amber-400/90" role="status">
          {data.trading212.error}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {data.summary.estAnnualByCurrency.map(({ currency: ccy, amount: amt }) => {
          const parts = periodizeAnnualDividend(amt);
          if (!parts) return null;
          return (
            <div key={ccy} className="rounded-xl border border-emerald-500/25 bg-emerald-950/25 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {ccy} · {t("portfolio.dividendPerYearLabel")}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">{fmtMoney(parts.annual, ccy)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("portfolio.dividendPerMonthLabel")}: {fmtMoney(parts.month, ccy)}
              </p>
            </div>
          );
        })}
        {data.summary.portfolioYieldOnValue != null ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">{t("portfolioDividends.yieldOnValue")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatDecimalAsPercent(data.summary.portfolioYieldOnValue / 100)}
            </p>
          </div>
        ) : null}
        {data.summary.portfolioYieldOnCost != null ? (
          <div className="rounded-xl border border-white/10 bg-zinc-900/40 px-4 py-3">
            <p className="text-xs text-muted-foreground">{t("portfolioDividends.yieldOnCost")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">
              {formatDecimalAsPercent(data.summary.portfolioYieldOnCost / 100)}
            </p>
          </div>
        ) : null}
      </div>

      {data.summary.incomeGrowthPills ? (
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("portfolioDividends.incomeGrowthTitle")}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              {t("portfolioDividends.incomeGrowthHint")}
            </CardDescription>
          </CardHeader>
          <div className="px-4 pb-6 sm:px-6">
            <GrowthPillsRow pills={data.summary.incomeGrowthPills} labels={pillLabels} />
          </div>
        </Card>
      ) : null}

      {chartData.length > 0 ? (
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("portfolioDividends.chartTitle")}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t("portfolioDividends.chartHint")}</CardDescription>
          </CardHeader>
          <div className="h-64 px-2 pb-4 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis dataKey="month" tick={{ fill: "#a1a1aa", fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    fmtMoney(v, data.summary.baseCurrency).replace(/\.\d+$/, "")
                  }
                  width={72}
                />
                <Tooltip
                  contentStyle={{
                    background: "#18181b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                  }}
                  formatter={(value: unknown) => {
                    const n = typeof value === "number" ? value : Number(value);
                    if (!Number.isFinite(n)) return "—";
                    return [fmtMoney(n, data.summary.baseCurrency), t("portfolioDividends.chartIncome")];
                  }}
                  labelFormatter={(_, payload) => {
                    const raw = payload?.[0]?.payload?.rawMonth as string | undefined;
                    return raw ? formatMonthLabel(raw, locale) : "";
                  }}
                />
                <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base sm:text-lg">{t("portfolioDividends.positionsTitle")}</CardTitle>
          <CardDescription className="text-xs sm:text-sm">{t("portfolioDividends.positionsHint")}</CardDescription>
        </CardHeader>
        {!hasPositions ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground sm:px-6">{t("portfolioDividends.noPayers")}</p>
        ) : (
          <div className="-mx-px overflow-x-auto">
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead>{t("portfolio.colSymbol")}</TableHead>
                  <TableHead className="text-right">{t("portfolio.colDivYld")}</TableHead>
                  <TableHead className="text-right">{t("portfolioDividends.yieldOnCost")}</TableHead>
                  <TableHead className="text-right">{t("portfolioDividends.dps")}</TableHead>
                  <TableHead className="text-right">{t("portfolio.colExpDiv")}</TableHead>
                  <TableHead>{t("portfolioDividends.growth")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.positions.map((p) => (
                  <TableRow key={p.symbol} className="border-white/10">
                    <TableCell className="font-medium">
                      <Link href={`/stock/${encodeURIComponent(p.symbol)}`} className="text-emerald-400 hover:underline">
                        {p.symbol}
                      </Link>
                      {p.name ? (
                        <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{p.name}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDividendYieldPercent(p.dividendYield)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-400/90">
                      {p.yieldOnCost != null ? formatDecimalAsPercent(p.yieldOnCost / 100) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {p.dividendPerShare != null ? fmtMoney(p.dividendPerShare, p.currency) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.estAnnualIncome != null ? fmtMoney(p.estAnnualIncome, p.currency) : "—"}
                    </TableCell>
                    <TableCell>
                      {p.growthPills ? (
                        <GrowthPillsRow pills={p.growthPills} labels={pillLabels} className="max-w-md" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("portfolioDividends.growthUnavailable")}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {hasPayments ? (
        <Card className="border-white/10 bg-zinc-900/40">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base sm:text-lg">{t("portfolioDividends.paymentsTitle")}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t("portfolioDividends.paymentsHint")}</CardDescription>
          </CardHeader>
          <div className="-mx-px overflow-x-auto">
            <Table className="min-w-[32rem]">
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead>{t("portfolio.t212DivColTicker")}</TableHead>
                  <TableHead>{t("portfolioDividends.source")}</TableHead>
                  <TableHead className="text-right">{t("portfolio.t212DivColAmount")}</TableHead>
                  <TableHead>{t("portfolio.t212DivColCurrency")}</TableHead>
                  <TableHead>{t("portfolio.t212DivColPaidOn")}</TableHead>
                  <TableHead className="w-[56px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.payments.slice(0, 50).map((p) => (
                  <TableRow key={p.id} className="border-white/10">
                    <TableCell className="font-mono font-medium">{p.ticker}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.amount, p.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.currency}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(`${p.paidOn}T12:00:00Z`).toLocaleDateString(locale === "bg" ? "bg-BG" : "en-US")}
                    </TableCell>
                    <TableCell>
                      {p.source === "manual" ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-8 text-red-400 hover:text-red-300"
                          aria-label={t("portfolio.manualDelete")}
                          disabled={deletingId === p.id}
                          onClick={() => void onDeleteManual(p.id)}
                        >
                          {deletingId === p.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Trash2 className="size-4" />
                          )}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">{t("portfolio.divDisclaimer")}</p>

      <Card className="border-white/10 bg-zinc-900/50">
        <CardHeader className="space-y-1 pb-2 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">{t("portfolioDividends.manualTitle")}</CardTitle>
          <CardDescription className="text-xs sm:text-sm">{t("portfolioDividends.manualHint")}</CardDescription>
        </CardHeader>
        {addError ? (
          <p className="px-4 pb-2 text-sm text-red-400 sm:px-6" role="alert">
            {addError}
          </p>
        ) : null}
        <form
          onSubmit={onAddManual}
          className="grid grid-cols-1 gap-3 px-4 pb-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-6"
        >
          <div className="grid gap-1.5">
            <Label htmlFor="d-ticker">{t("portfolio.manualSymbol")}</Label>
            <Input
              id="d-ticker"
              value={ticker}
              onChange={(e) => setTicker(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-amount">{t("portfolio.t212DivColAmount")}</Label>
            <Input
              id="d-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-date">{t("portfolio.t212DivColPaidOn")}</Label>
            <Input
              id="d-date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-ccy">{t("portfolio.manualCurrency")}</Label>
            <select
              id="d-ccy"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 rounded-md border border-white/10 bg-zinc-950 px-3 text-sm text-foreground"
            >
              {MANUAL_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5 lg:col-span-1">
            <Label htmlFor="d-note">{t("portfolioDividends.note")}</Label>
            <Input
              id="d-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="border-white/10 bg-zinc-950"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={adding} className="w-full sm:w-auto">
              {adding ? <Loader2 className="size-4 animate-spin" /> : t("portfolioDividends.manualAdd")}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
