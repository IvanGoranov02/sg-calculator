"use client";

import { CompanyIdentity } from "@/components/company/CompanyIdentity";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  COMPARE_GROUPS,
  bestIndex,
  relativeBarPct,
  visibleMetricsForGroup,
  type CompareGroup,
} from "@/lib/compareMetrics";
import { formatCurrency, formatPercent } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { CompareRow } from "@/lib/yahooCompare";
import { cn } from "@/lib/utils";

const GROUP_LABEL: Record<CompareGroup, string> = {
  valuation: "compare.groupValuation",
  profitability: "compare.groupProfit",
  growth: "compare.groupGrowth",
  balance: "compare.groupBalance",
  income: "compare.groupIncome",
  market: "compare.groupMarket",
};

function MetricBar({ pct, isBest }: { pct: number | null; isBest: boolean }) {
  if (pct == null) return null;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", isBest ? "bg-emerald-500" : "bg-foreground/20")}
        style={{ width: `${Math.max(6, Math.min(100, pct))}%` }}
      />
    </div>
  );
}

export function CompareMetricTables({ rows }: { rows: CompareRow[] }) {
  const { t } = useI18n();
  const groups = COMPARE_GROUPS.map((group) => ({
    group,
    metrics: visibleMetricsForGroup(rows, group),
  })).filter((g) => g.metrics.length > 0);

  if (groups.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      {groups.map(({ group, metrics }) => (
        <section key={group} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <h2 className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold tracking-tight">
            {t(GROUP_LABEL[group])}
          </h2>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 z-10 min-w-[9rem] bg-card text-muted-foreground">
                  {t("compare.metric")}
                </TableHead>
                {rows.map((r) => (
                  <TableHead key={r.symbol} className="min-w-[9.5rem] bg-card text-right whitespace-normal">
                    <div className="flex flex-col items-end gap-1">
                      <CompanyIdentity
                        symbol={r.symbol}
                        name={r.name}
                        href={`/stock/${encodeURIComponent(r.symbol)}`}
                        size="sm"
                        align="end"
                      />
                      <p
                        className={cn(
                          "font-mono text-[11px] tabular-nums",
                          r.changesPercentage >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400",
                        )}
                      >
                        {formatCurrency(r.price)} · {formatPercent(r.changesPercentage)}
                      </p>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => {
                const vals = rows.map((r) => m.get(r));
                const best = bestIndex(vals, m.better);
                return (
                  <TableRow key={m.key} className="group">
                    <TableCell className="sticky left-0 z-10 bg-card text-muted-foreground group-hover:bg-muted/50">
                      {t(m.labelKey)}
                    </TableCell>
                    {vals.map((v, i) => {
                      const isBest = i === best;
                      const bar = relativeBarPct(vals, v);
                      return (
                        <TableCell
                          key={rows[i].symbol}
                          className={cn(
                            "text-right font-mono tabular-nums",
                            isBest
                              ? "font-semibold text-emerald-700 dark:text-emerald-400"
                              : "text-foreground",
                          )}
                        >
                          {v != null && Number.isFinite(v) ? m.fmt(v) : "—"}
                          <MetricBar pct={bar} isBest={isBest} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </section>
      ))}
    </div>
  );
}
