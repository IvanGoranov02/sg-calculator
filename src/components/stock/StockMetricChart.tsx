"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact, formatPercent, formatVolume } from "@/lib/format";
import type {
  ChartMetric,
  HistoricalEodBar,
  PerformanceRange,
  StockAnalysisBundle,
} from "@/lib/stockAnalysisTypes";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { sortIncomeByYearAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

const rangeIds: PerformanceRange[] = ["1d", "1w", "1m", "1y", "5y", "max"];

const metricIds: ChartMetric[] = ["price", "revenue", "netIncome", "freeCashFlow"];

const strokeByMetric: Record<ChartMetric, string> = {
  price: "#34d399",
  revenue: "#60a5fa",
  netIncome: "#a78bfa",
  freeCashFlow: "#fbbf24",
};

/** Last calendar session in intraday series (YYYY-MM-DD). */
function lastSessionBarsIntraday(bars: HistoricalEodBar[]): HistoricalEodBar[] {
  if (bars.length === 0) return [];
  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  const day = last.date.slice(0, 10);
  return sorted.filter((b) => b.date.startsWith(day));
}

function filterDailyByRange(bars: HistoricalEodBar[], range: PerformanceRange): HistoricalEodBar[] {
  if (bars.length === 0) return [];
  if (range === "max") return bars;
  if (range === "1d") return filterDailyOneDay(bars);
  const lastDate = new Date(bars[bars.length - 1].date.slice(0, 10) + "T12:00:00Z");
  const start = new Date(lastDate);
  if (range === "1w") start.setUTCDate(start.getUTCDate() - 7);
  else if (range === "1m") start.setUTCMonth(start.getUTCMonth() - 1);
  else if (range === "1y") start.setUTCFullYear(start.getUTCFullYear() - 1);
  else if (range === "5y") start.setUTCFullYear(start.getUTCFullYear() - 5);
  else return bars;
  const t0 = start.getTime();
  return bars.filter((b) => {
    const t = new Date(b.date.slice(0, 10) + "T12:00:00Z").getTime();
    return t >= t0;
  });
}

function filterDailyOneDay(bars: HistoricalEodBar[]): HistoricalEodBar[] {
  if (bars.length === 0) return [];
  const last = bars[bars.length - 1];
  const day = last.date.slice(0, 10);
  return bars.filter((b) => b.date.slice(0, 10) === day);
}

/** Annual metrics: number of fiscal years to show per range. */
function fundamentalYearCount(range: PerformanceRange): number {
  switch (range) {
    case "1d":
      return 1;
    case "1w":
      return 2;
    case "1m":
      return 3;
    case "1y":
      return 4;
    case "5y":
      return 5;
    case "max":
      return 10_000;
    default:
      return 5;
  }
}

type SeriesPoint = { label: string; value: number };

function buildSeries(
  data: StockAnalysisBundle,
  metric: ChartMetric,
  range: PerformanceRange,
  formatFy: (fy: string) => string,
): SeriesPoint[] {
  switch (metric) {
    case "price": {
      if (range === "1d" && data.intraday?.length) {
        const session = lastSessionBarsIntraday(data.intraday);
        return session.map((row) => ({
          label: row.date.includes("T")
            ? row.date.slice(11, 16)
            : row.date.slice(0, 10),
          value: row.close,
        }));
      }
      const daily =
        range === "1d"
          ? filterDailyOneDay(data.historical)
          : filterDailyByRange(data.historical, range);
      return daily.map((row) => ({
        label: row.date.slice(0, 10),
        value: row.close,
      }));
    }
    case "revenue": {
      const rows = sortIncomeByYearAsc(data.income);
      const n = fundamentalYearCount(range);
      const slice = range === "max" ? rows : rows.slice(-Math.min(n, rows.length));
      return slice.map((row) => ({
        label: formatFy(row.fiscalYear),
        value: row.revenue,
      }));
    }
    case "netIncome": {
      const rows = sortIncomeByYearAsc(data.income);
      const n = fundamentalYearCount(range);
      const slice = range === "max" ? rows : rows.slice(-Math.min(n, rows.length));
      return slice.map((row) => ({
        label: formatFy(row.fiscalYear),
        value: row.netIncome,
      }));
    }
    case "freeCashFlow": {
      const rows = [...data.cashFlow].sort((a, b) => Number(a.fiscalYear) - Number(b.fiscalYear));
      const n = fundamentalYearCount(range);
      const slice = range === "max" ? rows : rows.slice(-Math.min(n, rows.length));
      return slice.map((row) => ({
        label: formatFy(row.fiscalYear),
        value: row.freeCashFlow,
      }));
    }
    default:
      return [];
  }
}

function priceStatsForRange(data: StockAnalysisBundle, range: PerformanceRange) {
  if (range === "1d" && data.intraday?.length) {
    const bars = lastSessionBarsIntraday(data.intraday);
    return aggregatePriceStats(bars);
  }
  const daily =
    range === "1d"
      ? filterDailyOneDay(data.historical)
      : filterDailyByRange(data.historical, range);
  return aggregatePriceStats(daily);
}

function aggregatePriceStats(bars: HistoricalEodBar[]) {
  if (bars.length === 0) return null;
  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  const high = Math.max(...bars.map((b) => b.high ?? b.close));
  const low = Math.min(...bars.map((b) => b.low ?? b.close));
  const volume = bars.reduce((s, b) => s + (b.volume ?? 0), 0);
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;
  return { first, last, high, low, changePct, volume };
}

function fundamentalStats(series: SeriesPoint[]) {
  if (series.length === 0) return null;
  const vals = series.map((s) => s.value);
  const first = vals[0];
  const last = vals[vals.length - 1];
  const high = Math.max(...vals);
  const low = Math.min(...vals);
  const changePct = first !== 0 ? ((last - first) / first) * 100 : 0;
  return { first, last, high, low, changePct };
}

type StockMetricChartProps = {
  data: StockAnalysisBundle;
};

export function StockMetricChart({ data }: StockMetricChartProps) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<ChartMetric>("price");
  const [range, setRange] = useState<PerformanceRange>("1y");

  const formatFy = useCallback(
    (fy: string) => t("chart.fyYear", { y: fy }),
    [t],
  );

  const metricOptions = useMemo(
    () =>
      metricIds.map((id) => ({
        id,
        label:
          id === "price"
            ? t("chart.metricPrice")
            : id === "revenue"
              ? t("chart.metricRevenue")
              : id === "netIncome"
                ? t("chart.metricNetIncome")
                : t("chart.metricFcf"),
      })),
    [t],
  );

  const rangeOptions = useMemo(
    () =>
      rangeIds.map((id) => ({
        id,
        label: id === "max" ? "Max" : id.toUpperCase(),
        title:
          id === "1d"
            ? t("chart.rangeTitle1d")
            : id === "1w"
              ? t("chart.rangeTitle1w")
              : id === "1m"
                ? t("chart.rangeTitle1m")
                : id === "1y"
                  ? t("chart.rangeTitle1y")
                  : id === "5y"
                    ? t("chart.rangeTitle5y")
                    : t("chart.rangeTitleMax"),
      })),
    [t],
  );

  const series = useMemo(
    () => buildSeries(data, metric, range, formatFy),
    [data, metric, range, formatFy],
  );

  const stroke = strokeByMetric[metric];

  const stats = useMemo(() => {
    if (metric === "price") {
      return priceStatsForRange(data, range);
    }
    return fundamentalStats(series);
  }, [data, metric, range, series]);

  const volumeLabel =
    metric === "price" &&
    stats &&
    "volume" in stats &&
    typeof stats.volume === "number" &&
    stats.volume > 0
      ? formatVolume(stats.volume)
      : "—";

  return (
    <Card className="border-white/10 bg-zinc-900/40 shadow-xl shadow-black/20">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-lg">{t("chart.performance")}</CardTitle>
            <CardDescription>{t("chart.performanceDesc")}</CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {metricOptions.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={metric === m.id ? "default" : "outline"}
                className={cn(
                  "rounded-lg",
                  metric === m.id && "bg-emerald-600 text-white hover:bg-emerald-600/90",
                )}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chart.range")}
          </p>
          <div className="flex flex-wrap gap-1">
            {rangeOptions.map((r) => (
              <Button
                key={r.id}
                type="button"
                size="sm"
                variant={range === r.id ? "secondary" : "ghost"}
                title={r.title}
                className={cn(
                  "h-8 min-w-11 rounded-md px-2 font-mono text-xs",
                  range === r.id && "bg-zinc-700 text-white hover:bg-zinc-700",
                )}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("chart.periodChange")}
              </p>
              <p
                className={cn(
                  "font-mono text-sm tabular-nums",
                  stats.changePct >= 0 ? "text-emerald-400" : "text-red-400",
                )}
              >
                {formatPercent(stats.changePct)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("chart.rangeHigh")}
              </p>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {formatCurrency(stats.high)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("chart.rangeLow")}
              </p>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {formatCurrency(stats.low)}
              </p>
            </div>
            {metric === "price" ? (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("chart.volumeSum")}
                </p>
                <p className="font-mono text-sm tabular-nums text-foreground">{volumeLabel}</p>
              </div>
            ) : (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {t("chart.lastValue")}
                </p>
                <p className="font-mono text-sm tabular-nums text-foreground">
                  {formatCurrency(stats.last)}
                </p>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => formatCurrencyCompact(v)}
                width={72}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const v = payload[0].value as number;
                  return (
                    <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                      <p className="text-muted-foreground">{label}</p>
                      <p className="font-mono text-sm tabular-nums text-foreground">
                        {formatCurrency(v)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2}
                fill="url(#fillMetric)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
