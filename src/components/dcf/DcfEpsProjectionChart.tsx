"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { EpsModelChartPoint } from "@/lib/epsModel";
import { formatCurrency, formatCurrencyCompact } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";

type DcfEpsProjectionChartProps = {
  points: EpsModelChartPoint[];
  horizonYears: number;
};

function formatQuarterLabel(yearIndex: number): string {
  const now = new Date();
  const targetYear = now.getFullYear() + yearIndex;
  return `Q1 ${targetYear}`;
}

export function DcfEpsProjectionChart({ points, horizonYears }: DcfEpsProjectionChartProps) {
  const { t } = useI18n();

  const rows = useMemo(
    () =>
      points.map((p) => ({
        label: formatQuarterLabel(p.yearIndex),
        projectedPrice: p.projectedPrice,
      })),
    [points],
  );

  if (points.length === 0) return null;

  return (
    <div className="h-72 w-full pt-2 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 28, right: 12, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
            interval={0}
            minTickGap={0}
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v) => formatCurrencyCompact(Number(v))}
          />
          <Tooltip
            formatter={(v) => formatCurrency(Number(v))}
            labelFormatter={(label) => String(label)}
            contentStyle={{
              background: "rgba(9,9,11,0.95)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "var(--muted-foreground)" }}
          />
          <Legend
            verticalAlign="top"
            align="center"
            wrapperStyle={{ fontSize: 12, paddingBottom: 8 }}
          />
          <Line
            type="monotone"
            dataKey="projectedPrice"
            name={t("dcf.epsChartProjectedPrice")}
            stroke="#34d399"
            strokeWidth={2.5}
            dot={{ r: 5, fill: "#34d399", strokeWidth: 0 }}
            activeDot={{ r: 7 }}
          >
            <LabelList
              dataKey="projectedPrice"
              position="top"
              formatter={(value) =>
                formatCurrencyCompact(typeof value === "number" ? value : Number(value))
              }
              className="fill-foreground text-[10px] font-mono"
            />
          </Line>
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        {t("dcf.epsChartHorizonNote", { years: horizonYears })}
      </p>
    </div>
  );
}
