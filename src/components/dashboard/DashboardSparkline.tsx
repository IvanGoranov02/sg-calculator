import { cn } from "@/lib/utils";

type DashboardSparklineProps = {
  points: number[];
  className?: string;
  /** When set, stroke follows session change instead of the long sparkline slope. */
  up?: boolean;
};

export function DashboardSparkline({ points, className, up }: DashboardSparklineProps) {
  if (points.length < 2) {
    return <div className={cn("h-9 w-full rounded bg-muted/40", className)} aria-hidden />;
  }

  const w = 160;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * (h - 2) - 1;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const rising = up ?? points[points.length - 1] >= points[0];
  const color = rising ? "#22c55e" : "#f87171";

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-9 w-full", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" />
    </svg>
  );
}
