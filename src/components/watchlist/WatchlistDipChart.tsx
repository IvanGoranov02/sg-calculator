"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { tickCoord } from "@/lib/chartSeriesUtils";
import {
  dipChartYDomain,
  dipChartYTicks,
  formatDipAxisPct,
  type DipRange,
} from "@/lib/dipFinder";
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

const SLOT_WIDTH_COMPACT = 26;
const SLOT_WIDTH = 30;

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
export function dipBarColor(pct: number, yMin: number, yMax: number): string {
  if (pct < 0) {
    const span = yMin < 0 ? -yMin : 1;
    const t = Math.min(1, Math.max(0, (pct - yMin) / span));
    return lerpColor("#7f1d1d", "#fdba74", t);
  }
  const span = yMax > 0 ? yMax : 1;
  const t = Math.min(1, Math.max(0, pct / span));
  return lerpColor("#e2e8f0", "#3b82f6", t);
}

type AngledXTickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: unknown };
};

function AngledXTick({ x, y, payload }: AngledXTickProps) {
  if (x == null || y == null) return null;
  const cx = tickCoord(x);
  const cy = tickCoord(y);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  const label = payload?.value == null ? "" : String(payload.value);
  return (
    <text
      x={cx}
      y={cy}
      dy={8}
      dx={-2}
      textAnchor="end"
      fill="var(--muted-foreground)"
      fontSize={9}
      fontFamily="ui-monospace, monospace"
      transform={`rotate(-45, ${cx}, ${cy})`}
    >
      {label}
    </text>
  );
}

export function WatchlistDipChart({ rows, range, compact = false }: WatchlistDipChartProps) {
  const { t } = useI18n();
  const rangeLabel = t(`watchlist.dipRange_${range}`);

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

  const dipValues = sorted.map((r) => r.dipPct);
  const { min: yMin, max: yMax } = dipChartYDomain(dipValues);
  const yTicks = dipChartYTicks(yMin, yMax);
  const slotWidth = compact ? SLOT_WIDTH_COMPACT : SLOT_WIDTH;
  const scrollWidth = Math.max(280, sorted.length * slotWidth);
  const barMaxSize = slotWidth - 8;
  const yAxisLabel = t("watchlist.dipYAxisLabel", { range: rangeLabel });

  return (
    <div
      className={cn(
        "relative min-h-0 min-w-0 w-full",
        compact ? "h-[min(300px,44vh)]" : "h-[min(440px,60vh)]",
      )}
    >
      <div className="absolute inset-0 flex min-h-0 min-w-0">
        <div
          className="flex w-7 shrink-0 items-center justify-center self-stretch"
          aria-hidden
        >
          <span className="block max-h-full -rotate-90 whitespace-nowrap text-[11px] leading-none text-muted-foreground">
            {yAxisLabel}
          </span>
        </div>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-auto">
          <div className="h-full min-w-full" style={{ width: `max(100%, ${scrollWidth}px)` }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sorted}
                margin={{ top: 12, right: 12, left: 2, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                <XAxis
                  dataKey="symbol"
                  tick={(props) => <AngledXTick {...props} />}
                  tickLine={false}
                  axisLine={{ stroke: "rgba(255,255,255,0.12)" }}
                  interval={0}
                  minTickGap={0}
                  height={52}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  ticks={yTicks}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tickFormatter={formatDipAxisPct}
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
                          {t("watchlist.dipVsWindowSma", { range: rangeLabel })}: {formatPercent(p.dipPct)}
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
                    <Cell key={entry.symbol} fill={dipBarColor(entry.dipPct, yMin, yMax)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
