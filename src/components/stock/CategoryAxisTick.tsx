"use client";

import { axisTickVisible } from "@/lib/chartSeriesUtils";

type CategoryAxisTickProps = {
  x?: number;
  y?: number;
  payload?: { value?: unknown };
  index?: number;
  total: number;
  maxLabels: number;
};

/** Centered category labels; hides extras instead of letting Recharts shift them. */
export function CategoryAxisTick({
  x = 0,
  y = 0,
  payload,
  index = 0,
  total,
  maxLabels,
}: CategoryAxisTickProps) {
  if (!axisTickVisible(index, total, maxLabels)) return <g />;
  return (
    <text
      x={x}
      y={y}
      dy={12}
      textAnchor="middle"
      fill="var(--muted-foreground)"
      fontSize={10}
    >
      {payload?.value == null ? "" : String(payload.value)}
    </text>
  );
}
