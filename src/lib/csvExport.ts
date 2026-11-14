/** Tiny CSV helpers for the "Export" buttons (client-side, no server round trip). */

export type CsvCell = string | number | null | undefined;

function escapeCell(v: CsvCell): string {
  if (v == null) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : v;
  // Neutralise spreadsheet formula injection from user-controlled text (names, notes).
  const safe = typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^[-+]?\d+([.,]\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return [header, ...rows].map((r) => r.map(escapeCell).join(",")).join("\r\n");
}

/** Downloads `csv` (with a UTF-8 BOM so Excel keeps Cyrillic and € intact). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvDateStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}
