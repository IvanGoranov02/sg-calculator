/** Share of total portfolio value as a percentage (0–100). */
export function allocationPercentOfTotal(totalValue: number, value: number): number {
  return totalValue > 0 ? (value / totalValue) * 100 : 0;
}

/** Format allocation percentage for bar rows (matches sector allocation UI). */
export function formatAllocationPercent(pct: number): string {
  return `${pct.toFixed(0)}%`;
}
