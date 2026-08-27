"use client";

import { axisTickVisible, tickCoord } from "@/lib/chartSeriesUtils";

type CategoryAxisTickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: unknown };
  index?: number;
  total: number;
  maxLabels: number;
};

/** Centered category labels; hides extras instead of letting Recharts shift them. */
export function CategoryAxisTick({
  x,
  y,
  payload,
  index = 0,
  total,
  maxLabels,
}: CategoryAxisTickProps) {
  if (!axisTickVisible(index, total, maxLabels)) return <g />;
  return (
    <text
      x={tickCoord(x)}
      y={tickCoord(y)}
      dy={12}
      textAnchor="middle"
      fill="var(--muted-foreground)"
      fontSize={10}
    >
      {payload?.value == null ? "" : String(payload.value)}
    </text>
  );
}
