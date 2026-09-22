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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GrowthPillsRow } from "@/components/stock/GrowthPillsRow";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatPercent,
  formatVolume,
} from "@/lib/format";
import type { HistoricalEodBar, PerformanceRange, StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { computeGrowthPills } from "@/lib/growthPills";
import { cn } from "@/lib/utils";

const rangeIds: PerformanceRange[] = ["1d", "1w", "1m", "1y", "5y", "max"];

const PRICE_STROKE = "#34d399";
const TRADING_DAYS_PER_YEAR = 252;

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

type SeriesPoint = { label: string; value: number };

function buildPriceSeries(data: StockAnalysisBundle, range: PerformanceRange): SeriesPoint[] {
  if (range === "1d" && data.intraday?.length) {
    const session = lastSessionBarsIntraday(data.intraday);
    return session.map((row) => ({
      label: row.date.includes("T") ? row.date.slice(11, 16) : row.date.slice(0, 10),
      value: row.close,
    }));
  }
  const daily =
    range === "1d" ? filterDailyOneDay(data.historical) : filterDailyByRange(data.historical, range);
  return daily.map((row) => ({
    label: row.date.slice(0, 10),
    value: row.close,
  }));
}

function priceStatsForRange(data: StockAnalysisBundle, range: PerformanceRange) {
  if (range === "1d" && data.intraday?.length) {
    const bars = lastSessionBarsIntraday(data.intraday);
    return aggregatePriceStats(bars);
  }
  const daily =
    range === "1d" ? filterDailyOneDay(data.historical) : filterDailyByRange(data.historical, range);
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

type StockMetricChartProps = {
  data: StockAnalysisBundle;
};

export function StockMetricChart({ data }: StockMetricChartProps) {
  const { t } = useI18n();
  const [range, setRange] = useState<PerformanceRange>("1y");

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

  const series = useMemo(() => buildPriceSeries(data, range), [data, range]);

  const fmtValue = useCallback((v: number) => formatCurrency(v), []);
  const fmtAxis = useCallback((v: number) => formatCurrencyCompact(v), []);

  const stats = useMemo(() => priceStatsForRange(data, range), [data, range]);

  const growthPills = useMemo(() => {
    const closes = [...data.historical]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => row.close);
    return computeGrowthPills(closes, TRADING_DAYS_PER_YEAR);
  }, [data.historical]);

  const pillLabels = useMemo(
    () => ({
      oneYear: t("chartsFund.pill1Y"),
      twoYear: t("chartsFund.pill2Y"),
      threeYear: t("chartsFund.pill3Y"),
    }),
    [t],
  );

  const volumeLabel =
    stats && typeof stats.volume === "number" && stats.volume > 0 ? formatVolume(stats.volume) : "—";

  return (
    <Card className="min-w-0 border-border bg-card shadow-xl shadow-sm">
      <CardHeader className="flex flex-col gap-3 pb-2">
        <CardTitle className="text-lg">{t("chart.performance")}</CardTitle>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("chart.range")}
          </span>
          <div className="flex flex-wrap gap-1">
            {rangeOptions.map((r) => (
              <Button
                key={r.id}
                type="button"
                size="sm"
                variant={range === r.id ? "secondary" : "ghost"}
                title={r.title}
                className={cn(
                  "h-7 min-w-10 rounded-md px-2 font-mono text-xs",
                  range === r.id && "bg-background text-foreground shadow-sm hover:bg-background",
                )}
                onClick={() => setRange(r.id)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 sm:grid-cols-4">
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
              <p className="font-mono text-sm tabular-nums text-foreground">{fmtValue(stats.high)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("chart.rangeLow")}
              </p>
              <p className="font-mono text-sm tabular-nums text-foreground">{fmtValue(stats.low)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("chart.volumeSum")}
              </p>
              <p className="font-mono text-sm tabular-nums text-foreground">{volumeLabel}</p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="min-h-0 min-w-0 pt-0">
        <div className="relative h-[200px] min-h-0 min-w-0 w-full sm:h-[220px] md:h-[240px]">
          <div className="absolute inset-0 min-h-0 min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillMetric" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PRICE_STROKE} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={PRICE_STROKE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--border)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => fmtAxis(v)}
                  width={72}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-mono text-sm tabular-nums text-foreground">{fmtValue(v)}</p>
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={PRICE_STROKE}
                  strokeWidth={2}
                  fill="url(#fillMetric)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <GrowthPillsRow pills={growthPills} labels={pillLabels} className="mt-3" />
      </CardContent>
    </Card>
  );
}
