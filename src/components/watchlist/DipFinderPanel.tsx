"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { WatchlistDipChart, type DipChartDatum } from "@/components/watchlist/WatchlistDipChart";
import {
  DIP_RANGES,
  dipChartRowForQuote,
  type DipRange,
  type QuoteHistoryBar,
} from "@/lib/dipFinder";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export type DipFinderQuote = {
  symbol: string;
  price: number;
  dipVsSma200Pct: number | null;
  twoHundredDayAverage: number | null;
};

type DipFinderPanelProps = {
  quotes: DipFinderQuote[];
  history: Record<string, QuoteHistoryBar[]>;
  compact?: boolean;
};

export function DipFinderPanel({ quotes, history, compact = false }: DipFinderPanelProps) {
  const { t } = useI18n();
  const [dipRange, setDipRange] = useState<DipRange>("1m");

  const rows = useMemo<DipChartDatum[]>(() => {
    const out: DipChartDatum[] = [];
    for (const q of quotes) {
      const bars = history[q.symbol] ?? history[q.symbol.toUpperCase()] ?? [];
      const row = dipChartRowForQuote(q, bars, dipRange);
      if (row) out.push(row);
    }
    return out;
  }, [quotes, history, dipRange]);

  return (
    <div className={compact ? "px-0 py-0" : ""}>
      <h3 className="mb-1 text-sm font-semibold tracking-tight">{t("watchlist.dipTitle")}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{t("watchlist.dipSubtitle")}</p>
      <div className="mb-3">
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t("watchlist.dipRangeLabel")}
        </p>
        <div className="flex flex-wrap gap-1" role="group" aria-label={t("watchlist.dipRangeLabel")}>
          {DIP_RANGES.map((id) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={dipRange === id ? "secondary" : "ghost"}
              className={cn(
                "h-8 min-w-11 rounded-md px-2 font-mono text-xs",
                dipRange === id && "bg-zinc-700 text-white hover:bg-zinc-700",
              )}
              onClick={() => setDipRange(id)}
            >
              {t(`watchlist.dipRange_${id}`)}
            </Button>
          ))}
        </div>
      </div>
      <WatchlistDipChart rows={rows} range={dipRange} compact={compact} />
    </div>
  );
}
