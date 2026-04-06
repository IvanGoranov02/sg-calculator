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
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 shadow-lg shadow-black/15">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight">{t("income.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("income.subtitle")}</p>
        <p className="mt-2 text-xs text-muted-foreground/90">{t("chartsFund.periodFilterTablesHint")}</p>
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[520px]">
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
                {years.map((y) => {
                  const r = incByFy.get(y);
                  return (
                    <TableCell key={y + key} className="text-right font-mono text-sm tabular-nums">
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
    </div>
  );
}
