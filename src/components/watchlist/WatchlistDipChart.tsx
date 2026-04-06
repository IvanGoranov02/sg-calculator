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
import type { WatchlistQuoteRow } from "@/lib/watchlistTypes";

type WatchlistDipChartProps = {
  quotes: WatchlistQuoteRow[];
};

export function WatchlistDipChart({ quotes }: WatchlistDipChartProps) {
  const { t } = useI18n();

  const rows = [...quotes]
    .filter((q) => q.dipVsSma200Pct != null && Number.isFinite(q.dipVsSma200Pct))
    .map((q) => ({
      symbol: q.symbol,
      dipVsSma200Pct: q.dipVsSma200Pct as number,
      sma: q.twoHundredDayAverage,
    }))
    .sort((a, b) => a.dipVsSma200Pct - b.dipVsSma200Pct);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("watchlist.dipNoData")}
      </p>
    );
  }

  return (
    <div className="h-[min(360px,50vh)] min-h-0 min-w-0 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
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
              const p = payload[0].payload as (typeof rows)[0];
              return (
                <div className="rounded-lg border border-white/10 bg-zinc-950/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
                  <p className="font-mono font-medium text-foreground">{p.symbol}</p>
                  <p className="text-muted-foreground">
                    {t("watchlist.dipVsSma")}: {formatPercent(p.dipVsSma200Pct)}
                  </p>
                  {p.sma != null ? (
                    <p className="text-muted-foreground">
                      {t("watchlist.sma200")}: {p.sma.toFixed(2)}
                    </p>
                  ) : null}
                </div>
              );
            }}
          />
          <Bar dataKey="dipVsSma200Pct" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {rows.map((entry) => (
              <Cell
                key={entry.symbol}
                fill={entry.dipVsSma200Pct >= 0 ? "#34d399" : "#f87171"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
