"use client";

import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";
import { stockLoadProgressLabel } from "@/lib/stockLoadProgressLabel";
import { cn } from "@/lib/utils";

type Props = {
  /** Last server progress event; null before first chunk. */
  event: StockAnalysisLoadProgress | null;
  /** 0–100 */
  percent: number;
  /** True until first NDJSON `progress` line (optional connecting state). */
  connecting?: boolean;
};

export function StockLoadProgressBar({ event, percent, connecting }: Props) {
  const { t } = useI18n();
  const label = connecting
    ? t("stock.loadProgressConnect")
    : event
      ? stockLoadProgressLabel(t, event)
      : t("stock.loadProgressConnect");

  const pct = Math.min(100, Math.max(0, percent));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">{label}</span>
        <span className="shrink-0 font-mono tabular-nums text-foreground/90">{Math.round(pct)}%</span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-zinc-800/90"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r from-emerald-600/90 to-emerald-400/90 transition-[width] duration-300 ease-out",
            connecting && "animate-pulse",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
