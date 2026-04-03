"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrencyCompact, formatCurrencyPerShare, formatPercent, formatRatio, formatVolume } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FiscalMetricRowDef = {
  label: string;
  values: (number | null)[];
  format: "currency" | "yoy" | "margin" | "ratio" | "eps" | "shares";
};

type FiscalMetricTableProps = {
  title: string;
  subtitle?: string;
  metricCol: string;
  years: string[];
  rows: FiscalMetricRowDef[];
  yearLabel: (y: string) => string;
};

function formatCell(fmt: FiscalMetricRowDef["format"], v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  switch (fmt) {
    case "currency":
      return formatCurrencyCompact(v);
    case "yoy":
      return formatPercent(v);
    case "margin":
      return `${v.toFixed(1)}%`;
    case "ratio":
      return formatRatio(v);
    case "eps":
      return formatCurrencyPerShare(v);
    case "shares":
      return formatVolume(v);
    default:
      return "—";
  }
}

export function FiscalMetricTable({ title, subtitle, metricCol, years, rows, yearLabel }: FiscalMetricTableProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-zinc-900/40 shadow-lg shadow-black/15">
      <div className="border-b border-white/10 px-4 py-4 sm:px-5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="overflow-x-auto">
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow className="border-white/10 hover:bg-transparent">
              <TableHead className="w-[200px] text-muted-foreground">{metricCol}</TableHead>
              {years.map((y) => (
                <TableHead key={y} className="text-right font-mono text-muted-foreground tabular-nums">
                  {yearLabel(y)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, idx) => (
              <TableRow
                key={row.label}
                className={cn(
                  "border-white/10 transition-colors hover:bg-white/[0.04]",
                  idx % 2 === 1 && "bg-white/[0.02]",
                )}
              >
                <TableCell className="font-medium">{row.label}</TableCell>
                {row.values.map((v, i) => (
                  <TableCell key={`${row.label}-${years[i] ?? i}`} className="text-right font-mono text-sm tabular-nums">
                    {formatCell(row.format, v)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
