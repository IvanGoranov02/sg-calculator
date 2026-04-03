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

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCompact, formatRatio } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FundamentalSeries = {
  dataKey: string;
  color: string;
  label: string;
};

type ValueFormat = "currency" | "percent" | "ratio";

type FundamentalChartCardProps = {
  title: string;
  description?: string;
  data: Record<string, unknown>[];
  xKey?: string;
  series: FundamentalSeries[];
  chartType: "bar" | "line";
  valueFormat: ValueFormat;
  className?: string;
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
}: FundamentalChartCardProps) {
  const manyTicks = data.length > 10;

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
              dot={{ r: 2, strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </LineChart>
      )}
    </ResponsiveContainer>
  );

  return (
    <Card className={cn("border-white/10 bg-zinc-900/40 shadow-lg shadow-black/15", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="h-[220px] pt-0">{data.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : chart}</CardContent>
    </Card>
  );
}
