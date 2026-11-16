/** "Updated 2 min ago" for data fetched at `atMs`, as seen at `nowMs`. */
export function freshnessLabel(atMs: number, nowMs: number, locale: "en" | "bg"): string {
  const sec = Math.max(0, Math.round((nowMs - atMs) / 1000));
  const bg = locale === "bg";
  if (sec < 60) return bg ? "Обновено току-що" : "Updated just now";
  const min = Math.round(sec / 60);
  if (min < 60) return bg ? `Обновено преди ${min} мин` : `Updated ${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return bg ? `Обновено преди ${hours} ч` : `Updated ${hours} h ago`;
  const days = Math.round(hours / 24);
  return bg ? `Обновено преди ${days} ${days === 1 ? "ден" : "дни"}` : `Updated ${days} ${days === 1 ? "day" : "days"} ago`;
}
