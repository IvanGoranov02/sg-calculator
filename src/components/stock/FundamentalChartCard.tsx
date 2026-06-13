"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CircleOff } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCompact, formatCurrencyPerShare, formatRatio, formatVolume } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { seriesCoverage } from "@/lib/chartSeriesUtils";
import { cn } from "@/lib/utils";

export type FundamentalSeries = {
  dataKey: string;
  color: string;
  label: string;
};

type ValueFormat = "currency" | "percent" | "ratio" | "perShare" | "compactCount";

type FundamentalChartCardProps = {
  title: string;
  description?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  series: FundamentalSeries[];
  chartType: "bar" | "line";
  valueFormat: ValueFormat;
  className?: string;
  /** One-line growth vs prior period (last two points in range). */
  growthNote?: string | null;
};

function formatTooltipValue(fmt: ValueFormat, v: number): string {
  if (!Number.isFinite(v)) return "—";
  switch (fmt) {
    case "currency":
      return formatCurrencyCompact(v);
    case "percent":
      return `${v.toFixed(1)}%`;
    case "ratio":
      return formatRatio(v);
    case "perShare":
      return formatCurrencyPerShare(v);
    case "compactCount":
      return formatVolume(v);
    default:
      return String(v);
  }
}

function axisTick(fmt: ValueFormat, v: number): string {
  if (!Number.isFinite(v)) return "";
  switch (fmt) {
    case "currency":
      return formatCurrencyCompact(v);
    case "percent":
      return `${v.toFixed(0)}%`;
    case "ratio":
      return formatRatio(v);
    case "perShare":
      return formatCurrencyPerShare(v);
    case "compactCount":
      return formatVolume(v);
    default:
      return String(v);
  }
}

export function FundamentalChartCard({
  title,
  description,
  data,
  xKey = "label",
  series,
  chartType,
  valueFormat,
  className,
  growthNote,
}: FundamentalChartCardProps) {
  const { t } = useI18n();
  const manyTicks = data.length > 10;
  const keys = series.map((s) => s.dataKey);
  const coverage = seriesCoverage(data, keys, xKey);
  const hasPoints = coverage.pointCount > 0;
  // Flag as sparse only when the emptiness is visually confusing: very few points,
  // or under half the visible range covered (e.g. a metric that only becomes
  // meaningful recently). A single missing period stays clean / un-flagged.
  const isSparse =
    hasPoints &&
    coverage.pointCount < coverage.total &&
    (coverage.pointCount <= 3 || coverage.pointCount / coverage.total < 0.5);
  // Larger dots so 1–2 points stay visible instead of a near-invisible mark.
  const dotRadius = coverage.pointCount <= 3 ? 4 : 2;

  function formatTooltipValueRaw(value: unknown): string {
    const v = Array.isArray(value) ? value[0] : value;
    if (v === undefined || v === null) return "—";
    const n = typeof v === "number" ? v : Number(v);
    return formatTooltipValue(valueFormat, n);
  }

  const chart = (
    <ResponsiveContainer width="100%" height="100%">
      {chartType === "bar" ? (
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: manyTicks ? 24 : 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            interval={manyTicks ? "preserveStartEnd" : 0}
            angle={manyTicks ? -40 : 0}
            textAnchor={manyTicks ? "end" : "middle"}
            height={manyTicks ? 56 : 28}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={68}
            tickFormatter={(v: number) => axisTick(valueFormat, v)}
          />
          <Tooltip
            formatter={formatTooltipValueRaw as never}
            contentStyle={{
              background: "rgba(9,9,11,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 11 }} /> : null}
          {series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.label}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              maxBarSize={48}
            />
          ))}
        </BarChart>
      ) : (
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: manyTicks ? 24 : 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            interval={manyTicks ? "preserveStartEnd" : 0}
            angle={manyTicks ? -40 : 0}
            textAnchor={manyTicks ? "end" : "middle"}
            height={manyTicks ? 56 : 28}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={68}
            tickFormatter={(v: number) => axisTick(valueFormat, v)}
          />
          <Tooltip
            formatter={formatTooltipValueRaw as never}
            contentStyle={{
              background: "rgba(9,9,11,0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {series.map((s) => (
            <Line
              key={s.dataKey}
              type="monotone"
              dataKey={s.dataKey}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{ r: dotRadius, strokeWidth: 0 }}
              activeDot={{ r: dotRadius + 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );

  return (
    <Card className={cn("min-w-0 border-white/10 bg-zinc-900/40 shadow-lg shadow-black/15", className)}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{title}</CardTitle>
          {isSparse ? (
            <span
              className="shrink-0 cursor-help rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] tabular-nums text-amber-300"
              title={t("chartsFund.chartCoverageTitle", {
                n: coverage.pointCount,
                total: coverage.total,
              })}
            >
              {coverage.pointCount}/{coverage.total}
            </span>
          ) : null}
        </div>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-[220px] min-h-0 min-w-0 pt-0">
        {!hasPoints ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/10 px-4 text-center">
            <CircleOff className="size-5 text-muted-foreground/50" aria-hidden />
            <p className="text-sm font-medium text-muted-foreground">{t("chartsFund.chartNoDataTitle")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground/80">
              {t("chartsFund.chartMetricNoDataDetail")}
            </p>
          </div>
        ) : (
          <div className="relative h-full min-h-0 min-w-0 w-full">
            <div className="absolute inset-0 min-h-0 min-w-0">{chart}</div>
          </div>
        )}
        {hasPoints && isSparse ? (
          <p className="mt-2 text-[11px] leading-snug text-amber-300/80">
            {coverage.pointCount === 1
              ? t("chartsFund.chartSinglePoint")
              : coverage.firstLabel
                ? t("chartsFund.chartCoverageNote", {
                    from: coverage.firstLabel,
                    n: coverage.pointCount,
                    total: coverage.total,
                  })
                : null}
          </p>
        ) : null}
        {growthNote ? (
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">{growthNote}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
