"use client";

import { useMemo } from "react";

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
import { annualDisplayFiscalYears, useStockAnalysisPeriod } from "@/lib/stockAnalysisPeriod";
import {
  isEmptyIncomeStatementCore,
  type IncomeStatementAnnual,
  type StockAnalysisBundle,
  incomeStatementMetricKeys,
  sortIncomeByYearAsc,
} from "@/lib/stockAnalysisTypes";
import { cn } from "@/lib/utils";

type IncomeStatementTableProps = {
  bundle: StockAnalysisBundle;
};

function byFy(rows: IncomeStatementAnnual[]): Map<string, IncomeStatementAnnual> {
  return new Map(rows.map((r) => [r.fiscalYear, r]));
}

export function IncomeStatementTable({ bundle }: IncomeStatementTableProps) {
  const { t } = useI18n();
  const { timeRange, customFromYear, customToYear } = useStockAnalysisPeriod();
  const sortedIncome = useMemo(() => sortIncomeByYearAsc(bundle.income), [bundle.income]);
  const incByFy = useMemo(() => byFy(sortedIncome), [sortedIncome]);

  const years = useMemo(
    () => annualDisplayFiscalYears(bundle, timeRange, customFromYear, customToYear),
    [bundle, timeRange, customFromYear, customToYear],
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg shadow-sm">
      <div className="space-y-2 border-b border-border px-4 py-5 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">{t("income.title")}</h2>
      </div>
      <div className="relative">
        <div className="overflow-x-auto px-1 py-1">
          <Table className="min-w-[26rem]">
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="sticky left-0 z-20 h-12 min-w-[8rem] bg-card px-3 py-3 text-left text-muted-foreground sm:px-4">
                  {t("income.metricCol")}
                </TableHead>
                {years.map((y) => (
                  <TableHead
                    key={y}
                    className="h-12 px-2.5 py-3 text-right font-mono text-muted-foreground tabular-nums sm:px-3"
                  >
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
                    "border-border transition-colors hover:bg-muted/50",
                    idx % 2 === 1 && "bg-muted/30",
                  )}
                >
                  <TableCell className="sticky left-0 z-10 bg-card px-3 py-3.5 align-middle text-sm font-medium leading-snug sm:px-4">
                    {t(`income.${key}`)}
                  </TableCell>
                  {years.map((y) => {
                    const r = incByFy.get(y);
                    return (
                      <TableCell
                        key={y + key}
                        className="px-2.5 py-3.5 text-right font-mono text-sm tabular-nums leading-snug sm:px-3"
                      >
                        {r == null || isEmptyIncomeStatementCore(r)
                          ? "—"
                          : formatCurrencyCompact(r[key])}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent lg:hidden" aria-hidden />
      </div>
    </div>
  );
}
