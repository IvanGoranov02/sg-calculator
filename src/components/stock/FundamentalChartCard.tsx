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

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyCompact, formatCurrencyPerShare, formatRatio, formatVolume } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
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
  /** Balance-sheet–heavy charts: offer Gemini fill when series are all null but periods exist. */
  geminiRetry?: boolean;
  onGeminiRetry?: () => void;
  geminiRetryPending?: boolean;
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

function seriesHasAnyPoint(
  rows: Record<string, unknown>[],
  keys: string[],
): boolean {
  for (const row of rows) {
    for (const k of keys) {
      const v = row[k];
      if (v === undefined || v === null) continue;
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n)) return true;
    }
  }
  return false;
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
  geminiRetry,
  onGeminiRetry,
  geminiRetryPending,
}: FundamentalChartCardProps) {
  const { t } = useI18n();
  const manyTicks = data.length > 10;
  const keys = series.map((s) => s.dataKey);
  const hasPoints = data.length === 0 ? false : seriesHasAnyPoint(data, keys);

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
      <CardContent className="h-[220px] pt-0">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : !hasPoints ? (
          <div className="flex h-full flex-col gap-2">
            <p className="text-sm text-muted-foreground">{t("chartsFund.chartMetricNoData")}</p>
            <p className="text-xs leading-relaxed text-muted-foreground/90">{t("chartsFund.chartMetricNoDataDetail")}</p>
          </div>
        ) : (
          chart
        )}
      </CardContent>
      {geminiRetry && !hasPoints && data.length > 0 && onGeminiRetry ? (
        <CardFooter className="flex flex-col items-stretch gap-2 border-t border-white/10 pt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="w-full border-emerald-500/30 bg-emerald-950/40 hover:bg-emerald-900/40"
            disabled={geminiRetryPending}
            onClick={onGeminiRetry}
          >
            {geminiRetryPending ? t("chartsFund.loadAgainGeminiBusy") : t("chartsFund.loadAgainGemini")}
          </Button>
          <p className="text-[10px] leading-snug text-muted-foreground">{t("chartsFund.geminiRetryDisclaimer")}</p>
        </CardFooter>
      ) : null}
    </Card>
  );
}
