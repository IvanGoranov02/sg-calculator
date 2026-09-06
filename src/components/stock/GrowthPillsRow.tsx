"use client";

import type { GrowthPills, GrowthPillsEntry } from "@/lib/growthPills";
import { cn } from "@/lib/utils";

type GrowthPillProps = {
  label: string;
  pct: number | null;
};

export function GrowthPill({ label, pct }: GrowthPillProps) {
  if (pct == null || !Number.isFinite(pct)) {
    return (
      <span className="rounded-full bg-zinc-800/90 px-2.5 py-1 font-mono text-[11px] tabular-nums text-muted-foreground">
        {label}: —
      </span>
    );
  }
  const pos = pct >= 0;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 font-mono text-[11px] tabular-nums",
        pos ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300",
      )}
    >
      {label}: {pos ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

type GrowthPillsRowProps = {
  pills: GrowthPills;
  labels: {
    oneYear: string;
    twoYear: string;
    fiveYear: string;
    tenYear: string;
  };
  className?: string;
};

export function GrowthPillsRow({ pills, labels, className }: GrowthPillsRowProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      <GrowthPill label={labels.oneYear} pct={pills.oneYear} />
      <GrowthPill label={labels.twoYear} pct={pills.twoYear} />
      <GrowthPill label={labels.fiveYear} pct={pills.fiveYear} />
      <GrowthPill label={labels.tenYear} pct={pills.tenYear} />
    </div>
  );
}

type GrowthPillsGroupProps = {
  entries: GrowthPillsEntry[];
  labels: GrowthPillsRowProps["labels"];
  className?: string;
};

export function GrowthPillsGroup({ entries, labels, className }: GrowthPillsGroupProps) {
  if (entries.length === 0) return null;
  if (entries.length === 1 && !entries[0]!.label) {
    return <GrowthPillsRow pills={entries[0]!.pills} labels={labels} className={className} />;
  }
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {entries.map((entry, i) => (
        <div key={entry.label ?? i} className="flex flex-wrap items-center gap-2">
          {entry.label ? (
            <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{entry.label}</span>
          ) : null}
          <GrowthPillsRow pills={entry.pills} labels={labels} />
        </div>
      ))}
    </div>
  );
}
