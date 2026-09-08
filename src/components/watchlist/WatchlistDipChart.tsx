"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LabelProps } from "recharts";

import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { DipRange } from "@/lib/dipFinder";
import { cn } from "@/lib/utils";

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
  compact?: boolean;
};

const Y_DOMAIN_MIN = -50;
const Y_DOMAIN_MAX = 25;
const Y_TICKS = Array.from({ length: (Y_DOMAIN_MAX - Y_DOMAIN_MIN) / 5 + 1 }, (_, i) => Y_DOMAIN_MIN + i * 5);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpColor(from: string, to: string, t: number): string {
  const [fr, fg, fb] = hexToRgb(from);
  const [tr, tg, tb] = hexToRgb(to);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
  const r = mix(fr, tr);
  const g = mix(fg, tg);
  const b = mix(fb, tb);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Red-orange for dips, light-blue to blue for gains (matches dip-finder mock). */
export function dipBarColor(pct: number): string {
  if (pct < 0) {
    const t = Math.min(1, Math.max(0, (pct - Y_DOMAIN_MIN) / -Y_DOMAIN_MIN));
    return lerpColor("#7f1d1d", "#fdba74", t);
  }
  const t = Math.min(1, Math.max(0, pct / Y_DOMAIN_MAX));
  return lerpColor("#e2e8f0", "#3b82f6", t);
}

type DipBarLabelProps = LabelProps & {
  rows: DipChartDatum[];
};

function DipBarLabel({ x, y, width, height, value, index, rows }: DipBarLabelProps) {
  const entry = rows[index ?? -1];
  if (!entry || x == null || y == null || width == null || height == null) return null;

  const cx = Number(x) + Number(width) / 2;
  const isNeg = entry.dipPct < 0;
  const cy = isNeg ? Number(y) + Number(height) + 12 : Number(y) - 6;

  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      fill="var(--muted-foreground)"
      fontSize={9}
      fontFamily="ui-monospace, monospace"
    >
      {value}
    </text>
  );
}

export function WatchlistDipChart({ rows, range, compact = false }: WatchlistDipChartProps) {
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

  const barMaxSize = compact ? 14 : Math.min(22, Math.max(8, Math.floor(640 / sorted.length)));

  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0 w-full",
        compact ? "h-[min(280px,42vh)]" : "h-[min(420px,58vh)]",
      )}
    >
      <div className="absolute inset-0 min-h-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={sorted}
            margin={{ top: 20, right: 12, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="symbol"
              tick={{ fill: "var(--muted-foreground)", fontSize: 9, fontFamily: "ui-monospace, monospace" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
              interval={0}
              minTickGap={0}
              height={32}
            />
            <YAxis
              domain={[Y_DOMAIN_MIN, Y_DOMAIN_MAX]}
              ticks={Y_TICKS}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              label={{
                value: t("watchlist.dipYAxisLabel"),
                angle: -90,
                position: "insideLeft",
                offset: 4,
                style: {
                  fill: "var(--muted-foreground)",
                  fontSize: 11,
                  textAnchor: "middle",
                },
              }}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
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
            <Bar dataKey="dipPct" maxBarSize={barMaxSize} radius={[2, 2, 2, 2]}>
              {sorted.map((entry) => (
                <Cell key={entry.symbol} fill={dipBarColor(entry.dipPct)} />
              ))}
              <LabelList
                dataKey="symbol"
                content={(props) => <DipBarLabel {...props} rows={sorted} />}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
