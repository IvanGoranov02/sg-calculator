/** Strict ISO period-end parsing; invalid dates must not create financial periods. */
export function periodEndDate(iso: string): Date | null {
  const day = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? date : null;
}

/** Preserve the month/day for a fiscal anniversary, clamping leap day when necessary. */
export function fiscalAnniversary(date: Date, year: number): Date {
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay), 12));
}

/** A full 4Q period requires four distinct, consecutive quarterly observations. */
export function isCompleteQuarterlyPeriod(points: ReadonlyArray<{ date: string }>): boolean {
  if (points.length !== 4) return false;
  const dates = points.map((p) => periodEndDate(p.date)?.getTime() ?? Number.NaN).sort((a, b) => a - b);
  if (!dates.every(Number.isFinite)) return false;
  const spanDays = (dates[3]! - dates[0]!) / 86_400_000;
  if (spanDays < 240 || spanDays > 310) return false;
  return dates.slice(1).every((date, i) => {
    const gapDays = (date - dates[i]!) / 86_400_000;
    return gapDays >= 60 && gapDays <= 120;
  });
}
