"use client";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { weekRangePosition } from "@/lib/compareMetrics";
import type { CompareRow } from "@/lib/yahooCompare";
import { cn } from "@/lib/utils";

function WeekRangeGauge({ row }: { row: CompareRow }) {
  const { t } = useI18n();
  const lo = row.investor.fiftyTwoWeekLow;
  const hi = row.investor.fiftyTwoWeekHigh;
  const pos = weekRangePosition(row);
  if (lo == null || hi == null || pos == null) return null;
  const pct = Math.max(0, Math.min(100, pos * 100));

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t("compare.weekRange")}
      </p>
      <div className="relative h-1.5 rounded-full bg-muted">
        <span
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500 ring-2 ring-card"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-muted-foreground">
        <span>{formatCurrency(lo)}</span>
        <span>{formatCurrency(hi)}</span>
      </div>
    </div>
  );
}

function recLabel(key: string | null): string | null {
  if (!key) return null;
  return key.replace(/_/g, " ");
}

export function CompareSnapshotCards({ rows }: { rows: CompareRow[] }) {
  const { t } = useI18n();

  return (
    <div
      className={cn(
        "grid gap-3",
        rows.length === 1 && "grid-cols-1 sm:max-w-sm",
        rows.length === 2 && "grid-cols-1 sm:grid-cols-2",
        rows.length === 3 && "grid-cols-1 sm:grid-cols-3",
        rows.length >= 4 && "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
      )}
    >
      {rows.map((r) => {
        const up = r.changesPercentage >= 0;
        const rec = recLabel(r.investor.recommendationKey);
        return (
          <Card key={r.symbol} className="border-border bg-card shadow-sm">
            <CardContent className="flex flex-col gap-3 pt-1">
              <div className="flex items-start justify-between gap-2">
                <CompanyIdentity
                  symbol={r.symbol}
                  name={r.name}
                  href={`/stock/${encodeURIComponent(r.symbol)}`}
                  size="md"
                  primaryLabel="name"
                  className="min-w-0"
                />
              </div>

              <div>
                <p className="font-mono text-2xl font-semibold tabular-nums tracking-tight">
                  {formatCurrency(r.price)}
                </p>
                <p
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    up ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
                  )}
                >
                  {formatPercent(r.changesPercentage)}
                  {r.weekChangePercent != null ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {t("compare.weekChangeShort", { value: formatPercent(r.weekChangePercent, 1) })}
                    </span>
                  ) : null}
                </p>
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <dt className="text-muted-foreground">{t("compare.marketCap")}</dt>
                  <dd className="font-mono tabular-nums">
                    {r.investor.marketCap != null ? formatCurrencyCompact(r.investor.marketCap) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("compare.trailingPE")}</dt>
                  <dd className="font-mono tabular-nums">
                    {r.investor.trailingPE != null && Number.isFinite(r.investor.trailingPE)
                      ? r.investor.trailingPE.toFixed(1)
                      : "—"}
                  </dd>
                </div>
              </dl>

              {r.sector || rec ? (
                <p className="truncate text-xs text-muted-foreground">
                  {r.sector ? r.sector : null}
                  {r.sector && rec ? " · " : null}
                  {rec ? `${t("compare.analysts")}: ${rec}` : null}
                </p>
              ) : null}

              <WeekRangeGauge row={r} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
