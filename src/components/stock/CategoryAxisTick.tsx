"use client";

import { axisTickVisible, tickCoord } from "@/lib/chartSeriesUtils";

type CategoryAxisTickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: unknown };
  index?: number;
  total: number;
  maxLabels: number;
  formatValue?: (value: unknown) => string;
};

/** Centered category labels; hides extras instead of letting Recharts shift them. */
export function CategoryAxisTick({
  x,
  y,
  payload,
  index = 0,
  total,
  maxLabels,
  formatValue,
}: CategoryAxisTickProps) {
  if (!axisTickVisible(index, total, maxLabels)) return <g />;
  const label =
    payload?.value == null
      ? ""
      : formatValue
        ? formatValue(payload.value)
        : String(payload.value);
  return (
    <text
      x={tickCoord(x)}
      y={tickCoord(y)}
      dy={12}
      textAnchor="middle"
      fill="var(--muted-foreground)"
      fontSize={10}
    >
      {label}
    </text>
  );
}
