"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyCompact } from "@/lib/format";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import type { IncomeStatementAnnual } from "@/lib/stockAnalysisTypes";
import { incomeStatementMetricKeys, sortIncomeByYearAsc } from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type IncomeStatementTableProps = {
  rows: IncomeStatementAnnual[];
};

export function IncomeStatementTable({ rows }: IncomeStatementTableProps) {
  const { t } = useI18n();
  const sorted = sortIncomeByYearAsc(rows);
  const years = sorted.map((r) => r.fiscalYear);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 shadow-lg shadow-black/15">
      <div className="border-b border-white/10 px-5 py-4">
        <h2 className="text-lg font-semibold tracking-tight">{t("income.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("income.subtitle")}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="border-white/10 hover:bg-transparent">
            <TableHead className="w-[200px] text-muted-foreground">{t("income.metricCol")}</TableHead>
            {years.map((y) => (
              <TableHead key={y} className="text-right font-mono text-muted-foreground tabular-nums">
                {t("chart.fyYear", { y })}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {incomeStatementMetricKeys.map((key, idx) => (
            <TableRow
              key={key}
              className={cn(
                "border-white/10 transition-colors hover:bg-white/[0.04]",
                idx % 2 === 1 && "bg-white/[0.02]",
              )}
            >
              <TableCell className="font-medium">{t(`income.${key}`)}</TableCell>
              {sorted.map((r) => (
                <TableCell key={r.fiscalYear + key} className="text-right font-mono text-sm tabular-nums">
                  {formatCurrencyCompact(r[key])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
