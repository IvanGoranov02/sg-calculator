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
      <div className="space-y-2 border-b border-white/10 px-4 py-5 sm:px-6">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="relative">
        <div className="overflow-x-auto px-1 py-1">
          <Table className="min-w-[26rem]">
            <TableHeader>
              <TableRow className="border-white/10 hover:bg-transparent">
                <TableHead className="sticky left-0 z-20 h-12 min-w-[8rem] bg-zinc-900 px-3 py-3 text-left text-muted-foreground sm:px-4">
                  {metricCol}
                </TableHead>
                {years.map((y) => (
                  <TableHead
                    key={y}
                    className="h-12 px-2.5 py-3 text-right font-mono text-muted-foreground tabular-nums sm:px-3"
                  >
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
                  <TableCell className="sticky left-0 z-10 bg-zinc-900 px-3 py-3.5 align-middle text-sm font-medium leading-snug sm:px-4">{row.label}</TableCell>
                  {row.values.map((v, i) => (
                    <TableCell
                      key={`${row.label}-${years[i] ?? i}`}
                      className="px-2.5 py-3.5 text-right font-mono text-sm tabular-nums leading-snug sm:px-3"
                    >
                      {formatCell(row.format, v)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-zinc-950 to-transparent lg:hidden" aria-hidden />
      </div>
    </div>
  );
}
