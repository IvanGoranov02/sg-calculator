"use client";

import { FormEvent, useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMonthKeyLabel, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type {
  PortfolioHistoryReason,
  PortfolioHistoryStatus,
  PortfolioValueChartPoint,
  PortfolioValueMonthSource,
} from "@/lib/portfolioValueHistory";
import { cn } from "@/lib/utils";

const MANUAL_CURRENCIES = ["EUR", "USD", "GBP"] as const;

export type PortfolioValueHistoryPayload = {
  chartSeries: PortfolioValueChartPoint[];
  baseCurrency: string;
  manualEntries: { month: string; amount: string; currency: string }[];
  computedHint: boolean;
  historyStatus?: PortfolioHistoryStatus;
  historyReason?: PortfolioHistoryReason;
  /** Another orders page is stored and the walk should continue. */
  historyHasMore?: boolean;
};

function fmtMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return n.toFixed(0);
  }
}

function fmtMoneyCompact(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.length === 3 ? currency : "USD",
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return n.toFixed(0);
  }
}

function sourceLabel(
  source: PortfolioValueMonthSource | null,
  t: (key: string) => string,
): string {
  if (source === "manual") return t("portfolio.valueSourceManual");
  if (source === "t212") return t("portfolio.valueSourceT212");
  if (source === "computed") return t("portfolio.valueSourceComputed");
  return "—";
}

function historyNotice(
  data: PortfolioValueHistoryPayload,
  t: (key: string) => string,
  backfillPaused: boolean,
): string | null {
  if (data.historyStatus === "partial" || data.historyReason === "incomplete") {
    return backfillPaused ? t("portfolio.valueHistoryPartialPaused") : t("portfolio.valueHistoryPartial");
  }
  if (data.historyReason === "missing_scope") return t("portfolio.valueHistoryMissingScope");
  if (data.historyReason === "mismatch") return t("portfolio.valueHistoryMismatch");
  return null;
}

type ChartProps = {
  data: PortfolioValueHistoryPayload | null;
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  backfillPaused?: boolean;
};

export function PortfolioValueChartCard({ error, onRetry, ...props }: ChartProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      {error ? (
        <div role="alert" className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("portfolio.valueHistoryError")}
          <Button variant="outline" size="sm" disabled={props.loading} onClick={onRetry}>
            {t("portfolio.valueHistoryRetry")}
          </Button>
        </div>
      ) : null}
      <PortfolioValueChartContent {...props} />
    </div>
  );
}

type RangeId = "6M" | "YTD" | "1Y" | "3Y" | "ALL";
const RANGES: { id: RangeId; months: number | null }[] = [
  { id: "6M", months: 6 },
  { id: "YTD", months: null },
  { id: "1Y", months: 12 },
  { id: "3Y", months: 36 },
  { id: "ALL", months: null },
];

function addMonths(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const CHART_TEXT = {
  en: {
    value: "Value",
    monthly: "Monthly change",
    since: "since",
    peak: "Highest",
    low: "Lowest",
    best: "Best month",
    worst: "Worst month",
    note: "Changes include money you added or withdrew.",
    ranges: { "6M": "6M", YTD: "YTD", "1Y": "1Y", "3Y": "3Y", ALL: "All" },
  },
  bg: {
    value: "Стойност",
    monthly: "Месечна промяна",
    since: "от",
    peak: "Най-висока",
    low: "Най-ниска",
    best: "Най-добър месец",
    worst: "Най-слаб месец",
    note: "Промените включват внесени или изтеглени пари.",
    ranges: { "6M": "6М", YTD: "От г.", "1Y": "1Г", "3Y": "3Г", ALL: "Всичко" },
  },
} as const;

type VisiblePoint = PortfolioValueChartPoint & { label: string };

function PortfolioValueChartContent({ data, loading, backfillPaused = false }: ChartProps) {
  const { t, locale } = useI18n();
  const c = locale === "bg" ? CHART_TEXT.bg : CHART_TEXT.en;
  const [range, setRange] = useState<RangeId>("ALL");
  const [mode, setMode] = useState<"value" | "monthly">("value");

  // Drop the empty lead-in (months before the first holding) so the line starts where the portfolio does.
  const chartData = useMemo<VisiblePoint[]>(() => {
    if (!data?.chartSeries.length) return [];
    const all = data.chartSeries.map((p) => ({ ...p, label: formatMonthKeyLabel(p.month, locale) }));
    const first = all.findIndex((p) => (p.value ?? 0) > 0);
    return first < 0 ? [] : all.slice(first);
  }, [data, locale]);

  const visible = useMemo<VisiblePoint[]>(() => {
    if (chartData.length < 2) return chartData;
    const lastKey = chartData[chartData.length - 1]!.month;
    let cutoff: string | null = null;
    if (range === "YTD") cutoff = `${lastKey.slice(0, 4)}-01`;
    else {
      const m = RANGES.find((r) => r.id === range)?.months;
      if (m) cutoff = addMonths(lastKey, -(m - 1));
    }
    const sliced = cutoff ? chartData.filter((p) => p.month >= cutoff) : chartData;
    return sliced.length >= 2 ? sliced : chartData;
  }, [chartData, range]);

  const stats = useMemo(() => {
    const pts = visible.filter((p): p is VisiblePoint & { value: number } => p.value != null);
    if (pts.length === 0) return null;
    const peak = pts.reduce((a, b) => (b.value > a.value ? b : a));
    const low = pts.reduce((a, b) => (b.value < a.value ? b : a));
    const moves: { label: string; month: string; pct: number }[] = [];
    for (let i = 1; i < pts.length; i++) {
      const prev = pts[i - 1]!.value;
      // Skip the build-up months, where any move is a huge percentage of almost nothing.
      if (prev < peak.value * 0.1) continue;
      moves.push({ label: pts[i]!.label, month: pts[i]!.month, pct: ((pts[i]!.value - prev) / prev) * 100 });
    }
    const best = moves.length >= 2 ? moves.reduce((a, b) => (b.pct > a.pct ? b : a)) : null;
    const worst = moves.length >= 2 ? moves.reduce((a, b) => (b.pct < a.pct ? b : a)) : null;
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    const delta = last.value - first.value;
    const pct = first.value > 0 && first.value >= last.value * 0.1 ? (delta / first.value) * 100 : null;
    return { peak, low, best, worst, first, last, delta, pct, moves };
  }, [visible]);

  if (loading && !data) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("portfolio.valueChartTitle")}</CardTitle>
        </CardHeader>
        <div className="flex items-center gap-2 px-4 pb-6 text-sm text-muted-foreground sm:px-6">
          <Loader2 className="size-4 animate-spin" />
          {t("portfolio.valueChartLoading")}
        </div>
      </Card>
    );
  }

  if (!data) return null;

  const notice = historyNotice(data, t, backfillPaused);
  const noticeIsError = data.historyStatus === "unavailable";

  if (chartData.length === 0) {
    if (!notice && !data.computedHint) return null;
    return (
      <Card className="border-border bg-card">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-base">{t("portfolio.valueChartTitle")}</CardTitle>
          <CardDescription className={cn("text-xs sm:text-sm", noticeIsError && "text-amber-200/90")}>
            {notice ?? t("portfolio.valueHistoryEmpty")}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const cur = data.baseCurrency;
  const up = (stats?.delta ?? 0) >= 0;
  const availableRanges = RANGES.filter(
    (r) => r.id === "ALL" || r.id === "YTD" || (r.months != null && chartData.length > r.months),
  );
  const pillBase = "rounded-md px-2.5 py-1 text-xs font-medium transition-colors";
  const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };

  type StatCard = { k: string; v: string; sub: string; tone: string };
  const statCardsRaw: (StatCard | null)[] = [
    stats ? { k: c.peak, v: fmtMoney(stats.peak.value, cur), sub: stats.peak.label, tone: "" } : null,
    stats ? { k: c.low, v: fmtMoney(stats.low.value, cur), sub: stats.low.label, tone: "" } : null,
    stats?.best ? { k: c.best, v: formatPercent(stats.best.pct), sub: stats.best.label, tone: "text-emerald-400" } : null,
    stats?.worst ? { k: c.worst, v: formatPercent(stats.worst.pct), sub: stats.worst.label, tone: "text-red-400" } : null,
  ];
  const statCards = statCardsRaw.filter((x): x is StatCard => x != null);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">{t("portfolio.valueChartTitle")}</CardTitle>
            {stats ? (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-2xl font-semibold tracking-tight">{fmtMoney(stats.last.value, cur)}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    up ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400",
                  )}
                >
                  {up ? "+" : "−"}
                  {fmtMoney(Math.abs(stats.delta), cur)}
                  {stats.pct != null ? ` · ${formatPercent(stats.pct)}` : ""}
                </span>
                <span className="text-xs text-muted-foreground">
                  {c.since} {stats.first.label}
                </span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg bg-muted p-0.5">
              {(["value", "monthly"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(pillBase, mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {m === "value" ? c.value : c.monthly}
                </button>
              ))}
            </div>
            <div className="flex rounded-lg bg-muted p-0.5">
              {availableRanges.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRange(r.id)}
                  className={cn(pillBase, range === r.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                >
                  {c.ranges[r.id]}
                </button>
              ))}
            </div>
          </div>
        </div>
        {notice ? (
          <p
            className={cn("text-xs sm:text-sm", noticeIsError ? "text-amber-200/90" : "text-muted-foreground")}
            role={noticeIsError ? "alert" : "status"}
          >
            {data.historyStatus === "partial" && !backfillPaused ? (
              <Loader2 className="mr-1.5 inline size-3.5 animate-spin" aria-hidden />
            ) : null}
            {notice}
          </p>
        ) : null}
      </CardHeader>

      <div className="h-72 px-2 pb-2 sm:px-4">
        <ResponsiveContainer width="100%" height="100%">
          {mode === "value" ? (
            <AreaChart data={visible} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" minTickGap={28} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis
                tick={axisTick}
                tickFormatter={(v: number) => fmtMoneyCompact(v, cur)}
                width={56}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3", strokeOpacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as VisiblePoint | undefined;
                  if (!row) return null;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="font-medium text-popover-foreground">{row.label}</p>
                      <p className="text-primary">
                        {t("portfolio.valueChartValue")}: {fmtMoney(row.value ?? 0, cur)}
                      </p>
                      {row.changePct != null ? (
                        <p className="text-muted-foreground">
                          {t("portfolio.valueChartChange")}: {formatPercent(row.changePct)}
                        </p>
                      ) : null}
                      <p className="text-muted-foreground">{sourceLabel(row.source, t)}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2.75}
                strokeLinecap="round"
                fill="url(#pvFill)"
                dot={visible.length <= 2 ? { r: 4, fill: "var(--primary)", strokeWidth: 0 } : false}
                activeDot={{ r: 5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }}
                isAnimationActive
                animationDuration={700}
              />
            </AreaChart>
          ) : (
            <BarChart data={stats?.moves ?? []} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 6" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" tick={axisTick} interval="preserveStartEnd" minTickGap={28} axisLine={false} tickLine={false} tickMargin={8} />
              <YAxis tick={axisTick} tickFormatter={(v: number) => `${v.toFixed(0)}%`} width={48} axisLine={false} tickLine={false} />
              <ReferenceLine y={0} stroke="var(--border)" />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { label: string; pct: number } | undefined;
                  if (!row) return null;
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="font-medium text-popover-foreground">{row.label}</p>
                      <p className={row.pct >= 0 ? "text-emerald-400" : "text-red-400"}>{formatPercent(row.pct)}</p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={22}>
                {(stats?.moves ?? []).map((m) => (
                  <Cell key={m.month} fill={m.pct >= 0 ? "var(--color-emerald-500)" : "var(--color-red-500)"} fillOpacity={0.9} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {statCards.length > 0 ? (
        <div className="grid grid-cols-2 gap-px overflow-hidden border-t border-border bg-border sm:grid-cols-4">
          {statCards.map((x) => (
            <div key={x.k} className="bg-card px-4 py-3">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.k}</p>
              <p className={cn("mt-0.5 text-base font-semibold", x.tone)}>{x.v}</p>
              <p className="text-xs text-muted-foreground">{x.sub}</p>
            </div>
          ))}
        </div>
      ) : null}
      <p className="px-4 pb-4 pt-3 text-[11px] text-muted-foreground sm:px-6">{c.note}</p>
    </Card>
  );
}

type FormProps = {
  data: PortfolioValueHistoryPayload | null;
  saving: boolean;
  onSubmit: (month: string, amount: string, currency: string) => Promise<void>;
  onDelete: (month: string) => Promise<void>;
};

function monthKeyFromParts(year: number, month: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthName(monthIndex: number, locale: string): string {
  return new Date(Date.UTC(2020, monthIndex - 1, 1)).toLocaleString(locale === "bg" ? "bg-BG" : "en-US", {
    month: "long",
    timeZone: "UTC",
  });
}

function yearOptions(entries: { month: string }[]): number[] {
  const now = new Date();
  const years = new Set<number>();
  for (let y = now.getFullYear(); y >= now.getFullYear() - 15; y--) years.add(y);
  for (const e of entries) {
    const y = Number(e.month.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

export function PortfolioManualMonthlyValueCard({ data, saving, onSubmit, onDelete }: FormProps) {
  const { t, locale } = useI18n();
  const now = new Date();
  const [enabled, setEnabled] = useState(true);
  const [year, setYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const month = monthKeyFromParts(year, monthNum);
    if (!month) return;
    await onSubmit(month, amount, currency);
    setAmount("");
  }

  const entries = data?.manualEntries ?? [];
  const years = yearOptions(entries);
  const selectClass = "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground";

  return (
    <Card className="border-border bg-card">
      <CardHeader className="space-y-1 pb-2 sm:pb-6">
        <CardTitle className="text-base sm:text-lg">{t("portfolio.valueManualTitle")}</CardTitle>
        <CardDescription className="text-xs sm:text-sm">{t("portfolio.valueManualHint")}</CardDescription>
      </CardHeader>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 sm:px-6">
        <Label htmlFor="pv-toggle" className="cursor-pointer text-sm font-medium leading-none">
          {t("portfolio.valueManualToggle")}
        </Label>
        <button
          type="button"
          id="pv-toggle"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((v) => !v)}
          className={cn(
            "inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-0.5 transition-colors outline-none",
            "focus-visible:ring-3 focus-visible:ring-ring/50",
            enabled ? "justify-end bg-emerald-500" : "justify-start bg-muted",
          )}
        >
          <span aria-hidden className="pointer-events-none block size-5 rounded-full bg-white shadow-sm" />
        </button>
      </div>
      {enabled ? (
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-5"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pv-year">{t("portfolio.valueManualYear")}</Label>
          <select
            id="pv-year"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className={selectClass}
            required
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv-month">{t("portfolio.valueManualMonth")}</Label>
          <select
            id="pv-month"
            value={monthNum}
            onChange={(e) => setMonthNum(Number(e.target.value))}
            className={selectClass}
            required
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthName(m, locale)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv-amount">{t("portfolio.valueManualAmount")}</Label>
          <Input
            id="pv-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="border-border bg-background"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pv-ccy">{t("portfolio.manualCurrency")}</Label>
          <select
            id="pv-ccy"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className={selectClass}
          >
            {MANUAL_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <Button type="submit" disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="size-4 animate-spin" /> : t("portfolio.valueManualSave")}
          </Button>
        </div>
      </form>
      ) : null}
      {entries.length > 0 ? (
        <ul className="space-y-2 border-t border-border px-4 py-4 sm:px-6">
          {entries.map((e) => (
            <li key={e.month} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">
                {formatMonthKeyLabel(e.month, locale)} — {e.amount} {e.currency}
              </span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="size-8 text-red-400 hover:text-red-300"
                aria-label={t("portfolio.valueManualDelete")}
                onClick={() => void onDelete(e.month)}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
