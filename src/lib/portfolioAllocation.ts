/** Share of total portfolio value as a percentage (0–100). */
export function allocationPercentOfTotal(totalValue: number, value: number): number {
  return totalValue > 0 ? (value / totalValue) * 100 : 0;
}

/** Format allocation percentage for bar rows (matches sector allocation UI). */
export function formatAllocationPercent(pct: number): string {
  return `${pct.toFixed(0)}%`;
}

export type DonutSliceAngles = {
  startAngle: number;
  endAngle: number;
};

type DonutAngleOptions = {
  /** Blank degrees between wedges. Ignored for a single wedge. */
  gapDegrees?: number;
  /** Small wedges are raised to this sweep when the ring has room. */
  minSweepDegrees?: number;
};

function clampWeight(weight: number): number {
  return Number.isFinite(weight) && weight > 0 ? weight : 0;
}

/**
 * Clockwise donut wedges in degrees, starting at 12 o'clock.
 * Non-positive weights are dropped so callers keep color alignment themselves.
 */
export function donutSliceAngles(weights: number[], options?: DonutAngleOptions): DonutSliceAngles[] {
  const positive = weights.map(clampWeight).filter((weight) => weight > 0);
  const count = positive.length;
  if (count === 0) return [];
  if (count === 1) return [{ startAngle: 0, endAngle: 360 }];

  const requestedGap = options?.gapDegrees ?? 2.5;
  const gap = Math.min(Math.max(0, requestedGap), (360 / count) * 0.2);
  const available = 360 - gap * count;
  const total = positive.reduce((sum, weight) => sum + weight, 0);
  const requestedMin = Math.max(0, options?.minSweepDegrees ?? 0);
  const minSweep = Math.min(requestedMin, available / count);

  const sweeps = positive.map((weight) => (weight / total) * available);
  if (minSweep > 0) {
    const clamped = sweeps.map(() => false);
    for (let pass = 0; pass < count; pass++) {
      let deficit = 0;
      let flex = 0;
      for (let i = 0; i < count; i++) {
        if (sweeps[i] < minSweep - 1e-6) {
          deficit += minSweep - sweeps[i];
          sweeps[i] = minSweep;
          clamped[i] = true;
        } else if (!clamped[i]) {
          flex += sweeps[i];
        }
      }
      if (deficit <= 1e-6 || flex <= deficit) break;
      for (let i = 0; i < count; i++) {
        if (!clamped[i]) sweeps[i] -= deficit * (sweeps[i] / flex);
      }
    }
  }

  const slices: DonutSliceAngles[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const startAngle = cursor + gap / 2;
    const endAngle = startAngle + sweeps[i];
    slices.push({ startAngle, endAngle });
    cursor = endAngle + gap / 2;
  }
  return slices;
}

function fmtCoord(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number(rounded.toFixed(2)).toString();
}

function polar(cx: number, cy: number, radius: number, angleDeg: number): [number, number] {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(rad), cy + radius * Math.sin(rad)];
}

/** SVG path for a donut wedge. Full circles use an even-odd ring. */
export function donutAnnulusPath(
  cx: number,
  cy: number,
  innerRadius: number,
  outerRadius: number,
  startAngle: number,
  endAngle: number,
): string {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.5) {
    return [
      `M ${fmtCoord(cx)} ${fmtCoord(cy - outerRadius)}`,
      `A ${fmtCoord(outerRadius)} ${fmtCoord(outerRadius)} 0 1 1 ${fmtCoord(cx)} ${fmtCoord(cy + outerRadius)}`,
      `A ${fmtCoord(outerRadius)} ${fmtCoord(outerRadius)} 0 1 1 ${fmtCoord(cx)} ${fmtCoord(cy - outerRadius)}`,
      `M ${fmtCoord(cx)} ${fmtCoord(cy - innerRadius)}`,
      `A ${fmtCoord(innerRadius)} ${fmtCoord(innerRadius)} 0 1 0 ${fmtCoord(cx)} ${fmtCoord(cy + innerRadius)}`,
      `A ${fmtCoord(innerRadius)} ${fmtCoord(innerRadius)} 0 1 0 ${fmtCoord(cx)} ${fmtCoord(cy - innerRadius)}`,
      "Z",
    ].join(" ");
  }

  const large = sweep > 180 ? 1 : 0;
  const [ox0, oy0] = polar(cx, cy, outerRadius, startAngle);
  const [ox1, oy1] = polar(cx, cy, outerRadius, endAngle);
  const [ix1, iy1] = polar(cx, cy, innerRadius, endAngle);
  const [ix0, iy0] = polar(cx, cy, innerRadius, startAngle);
  return [
    `M ${fmtCoord(ox0)} ${fmtCoord(oy0)}`,
    `A ${fmtCoord(outerRadius)} ${fmtCoord(outerRadius)} 0 ${large} 1 ${fmtCoord(ox1)} ${fmtCoord(oy1)}`,
    `L ${fmtCoord(ix1)} ${fmtCoord(iy1)}`,
    `A ${fmtCoord(innerRadius)} ${fmtCoord(innerRadius)} 0 ${large} 0 ${fmtCoord(ix0)} ${fmtCoord(iy0)}`,
    "Z",
  ].join(" ");
}
