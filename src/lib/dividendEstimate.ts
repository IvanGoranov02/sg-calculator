/**
 * Split an estimated annual dividend into month and day figures.
 * Month = annual / 12; day = annual / 365 (calendar, not trading days).
 */

export type PeriodizedDividend = {
  annual: number;
  month: number;
  day: number;
};

export function periodizeAnnualDividend(annual: number): PeriodizedDividend | null {
  if (!Number.isFinite(annual) || annual < 0) return null;
  return {
    annual,
    month: annual / 12,
    day: annual / 365,
  };
}
