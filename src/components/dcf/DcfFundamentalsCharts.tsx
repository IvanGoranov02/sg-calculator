"use client";

import { useMemo, useState } from "react";
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
import type { DcfFundamentalPoint, DcfFundamentalsHistory } from "@/lib/yahooDcfFundamentalsHistory";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

type Cadence = "annual" | "quarterly";

type ChartMetric = "revenue" | "operatingMargin" | "netIncome" | "ebitda" | "freeCashFlow";

const metrics: { id: ChartMetric; label: string; suffix: string }[] = [
  { id: "revenue", label: "Приходи · Revenue", suffix: "" },
  { id: "operatingMargin", label: "Оперативна марж · Operating margin", suffix: " %" },
  { id: "netIncome", label: "Нетна печалба · Net income", suffix: "" },
  { id: "ebitda", label: "EBITDA", suffix: "" },
  { id: "freeCashFlow", label: "FCF", suffix: "" },
];

const strokeByMetric: Record<ChartMetric, string> = {
  revenue: "#60a5fa",
  operatingMargin: "#f472b6",
  netIncome: "#a78bfa",
  ebitda: "#94a3b8",
  freeCashFlow: "#fbbf24",
};

function valueFromPoint(p: DcfFundamentalPoint, metric: ChartMetric): number | null {
  switch (metric) {
    case "revenue":
      return p.revenue;
    case "operatingMargin":
      return p.operatingMarginPct;
    case "netIncome":
      return p.netIncome;
    case "ebitda":
      return p.ebitda;
    case "freeCashFlow":
      return p.freeCashFlow;
    default:
      return null;
  }
}

function formatTooltipValue(metric: ChartMetric, v: number): string {
  if (metric === "operatingMargin") {
    return `${v.toFixed(1)}%`;
  }
  return formatCurrency(v);
}

function formatYAxisTick(metric: ChartMetric, v: number): string {
  if (metric === "operatingMargin") {
    return `${Math.round(v)}%`;
  }
  return formatCurrencyCompact(v);
}

type ChartRow = { label: string; value: number };

function buildSeries(
  points: DcfFundamentalPoint[],
  metric: ChartMetric,
): ChartRow[] {
  return points
    .map((p) => {
      const raw = valueFromPoint(p, metric);
      if (raw === null || Number.isNaN(raw)) {
        return null;
      }
      return { label: p.label, value: raw };
    })
    .filter((x): x is ChartRow => x !== null);
}

type FundSeriesStats = {
  first: number;
  last: number;
  high: number;
  low: number;
  /** Relative change % (non-margin metrics) */
  changePct: number;
  /** Percentage points first → last (operating margin only) */
  changePp: number | null;
};

function seriesStats(series: ChartRow[], metric: ChartMetric): FundSeriesStats | null {
  if (series.length === 0) return null;
  const vals = series.map((s) => s.value);
  const first = vals[0];
  const last = vals[vals.length - 1];
  const high = Math.max(...vals);
  const low = Math.min(...vals);
  if (metric === "operatingMargin") {
    return { first, last, high, low, changePct: 0, changePp: last - first };
  }
  const changePct = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
  return { first, last, high, low, changePct, changePp: null };
}

type DcfFundamentalsChartsProps = {
  data: DcfFundamentalsHistory | null;
};

export function DcfFundamentalsCharts({ data }: DcfFundamentalsChartsProps) {
  const [cadence, setCadence] = useState<Cadence>("annual");
  const [metric, setMetric] = useState<ChartMetric>("revenue");

  const points = cadence === "annual" ? data?.annual ?? [] : data?.quarterly ?? [];

  const series = useMemo(() => buildSeries(points, metric), [points, metric]);

  const stroke = strokeByMetric[metric];
  const stats = useMemo(() => seriesStats(series, metric), [series, metric]);

  if (!data || (data.annual.length === 0 && data.quarterly.length === 0)) {
    return (
      <Card className="border-white/10 bg-zinc-900/40">
        <CardHeader>
          <CardTitle className="text-lg">Фундаменти във времето</CardTitle>
          <CardDescription>Няма достатъчно годишни/тримесечни данни от Yahoo за този символ.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-white/10 bg-zinc-900/40 shadow-xl shadow-black/20">
      <CardHeader className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="text-lg">Фундаменти във времето</CardTitle>
            <CardDescription>
              Годишни (FY) и тримесечни периоди от Yahoo. <strong className="text-foreground/90">Оперативната марж</strong> е в проценти
              (оперативна печалба / приходи) — отделна скала и форматиране от сумите в долари.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Период</p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={cadence === "annual" ? "secondary" : "outline"}
                className="rounded-lg"
                onClick={() => setCadence("annual")}
              >
                Годишни
              </Button>
              <Button
                type="button"
                size="sm"
                variant={cadence === "quarterly" ? "secondary" : "outline"}
                className="rounded-lg"
                onClick={() => setCadence("quarterly")}
              >
                Тримесечия
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Показател</p>
          <div className="flex flex-wrap gap-1.5">
            {metrics.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={metric === m.id ? "default" : "outline"}
                className={cn(
                  "rounded-lg text-left",
                  metric === m.id && "bg-emerald-600 text-white hover:bg-emerald-600/90",
                )}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </Button>
            ))}
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-zinc-950/50 px-3 py-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Промяна (първи → последен)
              </p>
              <p
                className={cn(
                  "font-mono text-sm tabular-nums",
                  metric === "operatingMargin"
                    ? (stats.changePp ?? 0) >= 0
                      ? "text-emerald-400"
                      : "text-red-400"
                    : stats.changePct >= 0
                      ? "text-emerald-400"
                      : "text-red-400",
                )}
              >
                {metric === "operatingMargin" && stats.changePp !== null
                  ? `${stats.changePp >= 0 ? "+" : ""}${stats.changePp.toFixed(1)} п.п.`
                  : formatPercent(stats.changePct)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Макс.</p>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {metric === "operatingMargin" ? `${stats.high.toFixed(1)}%` : formatCurrency(stats.high)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Мин.</p>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {metric === "operatingMargin" ? `${stats.low.toFixed(1)}%` : formatCurrency(stats.low)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Последна</p>
              <p className="font-mono text-sm tabular-nums text-foreground">
                {metric === "operatingMargin"
                  ? `${stats.last.toFixed(1)}%`
                  : formatCurrency(stats.last)}
              </p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[360px] w-full">
          {series.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Няма данни за този показател (напр. липсва EBITDA).
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dcfFillFund" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => formatYAxisTick(metric, v)}
                  width={metric === "operatingMargin" ? 48 : 72}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const v = payload[0].value as number;
                    return (
                      <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                        <p className="text-muted-foreground">{label}</p>
                        <p className="font-mono text-sm tabular-nums text-foreground">
                          {formatTooltipValue(metric, v)}
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
                  fill="url(#dcfFillFund)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  connectNulls={metric === "ebitda"}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
