/**
 * Quarter names for chart axes. A bar dated by the month a quarter ends ("Sep 26") reads as
 * if the data were from September, while the numbers came out weeks later with the report.
 * Naming the quarter ("Q3 '26", or "Q1 FY26" for companies whose year does not end in December)
 * says what the bar is.
 */

/** Month (1–12) a period ending on this date belongs to; 52/53-week years end in the first days of the next month. */
function closingMonth(iso: string): { year: number; month: number } {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (d <= 7) return m === 1 ? { year: y - 1, month: 12 } : { year: y, month: m - 1 };
  return { year: y, month: m };
}

/** Month the fiscal year ends in, from the end dates of the annual statements (December when unknown). */
export function fiscalYearEndMonth(annualEnds: readonly string[]): number {
  const latest = [...annualEnds].filter((s) => /^\d{4}-\d{2}-\d{2}/.test(s)).sort().pop();
  return latest ? closingMonth(latest).month : 12;
}

/** Fiscal quarter (1–4) and fiscal year of the quarter that ends on `periodEnd`. */
export function fiscalQuarterOf(periodEnd: string, fyEndMonth: number): { quarter: number; fiscalYear: number } {
  const { year, month } = closingMonth(periodEnd);
  const monthsAfterYearEnd = (((month - fyEndMonth) % 12) + 12) % 12;
  const quarter = monthsAfterYearEnd === 0 ? 4 : Math.min(4, Math.ceil(monthsAfterYearEnd / 3));
  const fiscalYear = month <= fyEndMonth ? year : year + 1;
  return { quarter, fiscalYear };
}

/** Short axis label: "Q3 '26" for calendar-year companies, "Q1 FY26" / "Q1 ФГ26" otherwise. */
export function quarterLabel(periodEnd: string, fyEndMonth: number, locale: string): string {
  const { quarter, fiscalYear } = fiscalQuarterOf(periodEnd, fyEndMonth);
  const yy = String(fiscalYear).slice(-2);
  if (fyEndMonth === 12) return `Q${quarter} '${yy}`;
  return `Q${quarter} ${locale === "bg" ? "ФГ" : "FY"}${yy}`;
}

/** Tooltip title: "Q3 2026 · quarter ended 30 Sep 2026". */
export function quarterTitle(periodEnd: string, fyEndMonth: number, locale: string): string {
  const { quarter, fiscalYear } = fiscalQuarterOf(periodEnd, fyEndMonth);
  const bg = locale === "bg";
  const ended = new Date(`${periodEnd.slice(0, 10)}T12:00:00Z`).toLocaleDateString(bg ? "bg-BG" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const name = fyEndMonth === 12 ? `Q${quarter} ${fiscalYear}` : `Q${quarter} ${bg ? "ФГ" : "FY"}${fiscalYear}`;
  return bg ? `${name} · тримесечие до ${ended}` : `${name} · quarter ended ${ended}`;
}
