"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { DipRange } from "@/lib/dipFinder";

export type DipChartDatum = {
  symbol: string;
  dipPct: number;
  dipVsSma200Pct: number | null;
  lookbackChangePct: number | null;
  windowSma: number | null;
  sma200: number | null;
};

type WatchlistDipChartProps = {
  rows: DipChartDatum[];
  range: DipRange;
};

export function WatchlistDipChart({ rows, range }: WatchlistDipChartProps) {
  const { t } = useI18n();

  const sorted = [...rows]
    .filter((q) => Number.isFinite(q.dipPct))
    .sort((a, b) => a.dipPct - b.dipPct);

  if (sorted.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("watchlist.dipNoData")}
      </p>
    );
  }

  return (
    <div className="relative h-[min(360px,50vh)] min-h-0 min-w-0 w-full">
      <div className="absolute inset-0 min-h-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 8, right: 12, left: 4, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
          <XAxis
            type="number"
            domain={["dataMin - 2", "dataMax + 2"]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(1)}%`}
          />
          <YAxis
            type="category"
            dataKey="symbol"
            width={52}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof sorted)[0];
              return (
                <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                  <p className="font-mono font-medium text-foreground">{p.symbol}</p>
                  <p className="text-muted-foreground">
                    {t("watchlist.dipVsWindowSma", { range })}: {formatPercent(p.dipPct)}
                  </p>
                  {p.lookbackChangePct != null ? (
                    <p className="text-muted-foreground">
                      {t("watchlist.dipLookback")}: {formatPercent(p.lookbackChangePct)}
                    </p>
                  ) : null}
                  {p.dipVsSma200Pct != null ? (
                    <p className="text-muted-foreground">
                      {t("watchlist.dipVsSma")}: {formatPercent(p.dipVsSma200Pct)}
                    </p>
                  ) : null}
                  {p.sma200 != null ? (
                    <p className="text-muted-foreground">
                      {t("watchlist.sma200")}: {p.sma200.toFixed(2)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          <Bar dataKey="dipPct" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {sorted.map((entry) => (
              <Cell
                key={entry.symbol}
                fill={entry.dipPct >= 0 ? "#34d399" : "#f87171"}
              />
            ))}
          </Bar>
        </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
