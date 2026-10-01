"use client";

import { categoryTickAnchor, tickCoord } from "@/lib/chartSeriesUtils";

type CategoryAxisTickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: unknown };
  index?: number;
  total: number;
  /** When false, the slot stays so the bar is centered but the text is omitted. */
  show: boolean;
  formatValue?: (value: unknown) => string;
  /** Category-axis width in px. Used to decide whether edge labels must anchor inward. */
  axisWidth?: number;
  /** Reserved glyph width for this tick's text. */
  labelWidth?: number;
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
  axisWidth = 0,
  labelWidth = 0,
}: CategoryAxisTickProps) {
  if (!show) return <g />;
  const label =
    payload?.value == null
      ? ""
      : formatValue
        ? formatValue(payload.value)
        : String(payload.value);
  const textAnchor =
    axisWidth > 0 && labelWidth > 0
      ? categoryTickAnchor(index, total, axisWidth, labelWidth)
      : index <= 0
        ? "start"
        : index >= total - 1
          ? "end"
          : "middle";
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
