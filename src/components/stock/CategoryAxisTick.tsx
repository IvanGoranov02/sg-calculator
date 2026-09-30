"use client";

import { tickCoord } from "@/lib/chartSeriesUtils";

type CategoryAxisTickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: unknown };
  index?: number;
  total: number;
  /** When false, the slot stays so the bar is centered but the text is omitted. */
  show: boolean;
  formatValue?: (value: unknown) => string;
};

/** Category label centered on its bar. Edge ticks anchor inward so they are not clipped. */
export function CategoryAxisTick({
  x,
  y,
  payload,
  index = 0,
  total,
  show,
  formatValue,
}: CategoryAxisTickProps) {
  if (!show) return <g />;
  const label =
    payload?.value == null
      ? ""
      : formatValue
        ? formatValue(payload.value)
        : String(payload.value);
  const textAnchor = index <= 0 ? "start" : index >= total - 1 ? "end" : "middle";
  return (
    <text
      x={tickCoord(x)}
      y={tickCoord(y)}
      dy={12}
      textAnchor={textAnchor}
      fill="var(--muted-foreground)"
      fontSize={10}
    >
      {label}
    </text>
  );
}
