"use client";

import Link from "next/link";
import { FormEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Loader2, Trash2 } from "lucide-react";
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
import {
  formatDecimalAsPercent,
  formatDividendYieldPercent,
  formatLocaleDate,
  formatMonthKeyLabel,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";
import {
  buildHoldingMonthlyTimeline,
  type PortfolioDividendsPayload,
} from "@/lib/portfolioDividends";
import { cn } from "@/lib/utils";

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

type PortfolioDividendsViewProps = {
  reloadToken?: number;
  liveRefreshToken?: number;
};

export function PortfolioDividendsView({
  reloadToken = 0,
  liveRefreshToken = 0,
}: PortfolioDividendsViewProps) {
  const { t, locale } = useI18n();
  const { dateFormat } = usePreferences();
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
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);

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
    }),
    [t],
  );

  const chartData = useMemo(() => {
    if (!data?.chartSeries.length) return [];
    return data.chartSeries.map((p) => ({
      month: formatMonthKeyLabel(p.month, locale),
      income: p.income != null && Number.isFinite(p.income) ? p.income : 0,
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
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
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
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{t("portfolioDividends.yieldOnValue")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">
              {formatDecimalAsPercent(data.summary.portfolioYieldOnValue / 100)}
            </p>
          </div>
        ) : null}
        {data.summary.portfolioYieldOnCost != null ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{t("portfolioDividends.yieldOnCost")}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-emerald-400">
              {formatDecimalAsPercent(data.summary.portfolioYieldOnCost / 100)}
            </p>
          </div>
        ) : null}
      </div>

      {data.summary.incomeGrowthPills ? (
        <Card className="border-border bg-card">
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
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("portfolioDividends.chartTitle")}</CardTitle>
          </CardHeader>
          <div className="h-64 px-2 pb-4 sm:px-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickFormatter={(v: number) =>
                    fmtMoney(v, data.summary.baseCurrency).replace(/\.\d+$/, "")
                  }
                  width={72}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const n = typeof payload[0].value === "number" ? payload[0].value : Number(payload[0].value);
                    const raw = payload[0]?.payload?.rawMonth as string | undefined;
                    const monthLabel = raw ? formatMonthKeyLabel(raw, locale) : String(label ?? "");
                    return (
                      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                        <p className="font-medium text-popover-foreground">{monthLabel}</p>
                        <p className="text-emerald-600 dark:text-emerald-400">
                          {t("portfolioDividends.chartIncome")}:{" "}
                          {Number.isFinite(n) ? fmtMoney(n, data.summary.baseCurrency) : "—"}
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="income" fill="#34d399" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      ) : null}

      <Card className="border-border bg-card">
        <CardHeader className="space-y-1 pb-2">
          <CardTitle className="text-base sm:text-lg">{t("portfolioDividends.positionsTitle")}</CardTitle>
        </CardHeader>
        {!hasPositions ? (
          <p className="px-4 pb-6 text-sm text-muted-foreground sm:px-6">{t("portfolioDividends.noPayers")}</p>
        ) : (
          <div className="-mx-px overflow-x-auto">
            <Table className="min-w-[40rem]">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead>{t("portfolio.colSymbol")}</TableHead>
                  <TableHead className="text-right">{t("portfolio.colDivYld")}</TableHead>
                  <TableHead className="text-right">{t("portfolioDividends.yieldOnCost")}</TableHead>
                  <TableHead className="text-right">{t("portfolioDividends.dps")}</TableHead>
                  <TableHead className="text-right">{t("portfolio.colExpDiv")}</TableHead>
                  <TableHead>{t("portfolioDividends.growth")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.positions.map((p) => {
                  const holdingMonths = buildHoldingMonthlyTimeline(data.payments, p.symbol);
                  const isExpanded = expandedSymbol === p.symbol;
                  const canExpand = holdingMonths.length > 0;
                  return (
                    <Fragment key={p.symbol}>
                      <TableRow
                        className={cn(
                          "border-border",
                          canExpand && "cursor-pointer hover:bg-muted/50",
                        )}
                        onClick={
                          canExpand
                            ? () => setExpandedSymbol((s) => (s === p.symbol ? null : p.symbol))
                            : undefined
                        }
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-start gap-1.5">
                            {canExpand ? (
                              <ChevronDown
                                className={cn(
                                  "mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform",
                                  isExpanded && "rotate-180",
                                )}
                                aria-hidden
                              />
                            ) : null}
                            <div className="min-w-0">
                              <Link
                                href={`/stock/${encodeURIComponent(p.symbol)}`}
                                className="text-emerald-400 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {p.symbol}
                              </Link>
                              {p.name ? (
                                <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{p.name}</p>
                              ) : null}
                            </div>
                          </div>
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
                            <span className="text-xs text-muted-foreground">
                              {t("portfolioDividends.growthUnavailable")}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                      {isExpanded && holdingMonths.length > 0 ? (
                        <TableRow className="border-border bg-muted/50 hover:bg-muted/50">
                          <TableCell colSpan={6} className="py-3">
                            <div className="flex flex-wrap gap-x-4 gap-y-2">
                              {holdingMonths.map((row) => (
                                <div
                                  key={row.month}
                                  className="min-w-[4.5rem] text-center"
                                >
                                  <p className="text-[11px] font-medium text-muted-foreground">
                                    {formatMonthKeyLabel(row.month, locale)}
                                  </p>
                                  <p className="mt-0.5 text-sm tabular-nums text-foreground">
                                    {row.amount != null ? fmtMoney(row.amount, row.currency) : ""}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {hasPayments ? (
        <Card className="border-border bg-card">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-base sm:text-lg">{t("portfolioDividends.paymentsTitle")}</CardTitle>
            <CardDescription className="text-xs sm:text-sm">{t("portfolioDividends.paymentsHint")}</CardDescription>
          </CardHeader>
          <div className="-mx-px overflow-x-auto">
            <Table className="min-w-[32rem]">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
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
                  <TableRow key={p.id} className="border-border">
                    <TableCell className="font-mono font-medium">{p.ticker}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {p.source === "manual" ? t("portfolio.sourceManual") : t("portfolio.sourceT212")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.amount, p.currency)}</TableCell>
                    <TableCell className="text-muted-foreground">{p.currency}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatLocaleDate(p.paidOn, locale, dateFormat)}
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

      <Card className="border-border bg-card">
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
              className="border-border bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-amount">{t("portfolio.t212DivColAmount")}</Label>
            <Input
              id="d-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-border bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-date">{t("portfolio.t212DivColPaidOn")}</Label>
            <Input
              id="d-date"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              className="border-border bg-background"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="d-ccy">{t("portfolio.manualCurrency")}</Label>
            <select
              id="d-ccy"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground"
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
              className="border-border bg-background"
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
