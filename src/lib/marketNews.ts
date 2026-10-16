export type MarketNewsItem = { title: string; publisher: string | null; link: string; publishedAt: string | null };

function publishedAt(value: unknown): string | null {
  let date: Date;
  // yahoo-finance2 validates providerPublishTime into a Date, rather than Unix seconds.
  if (value instanceof Date) date = value;
  else if (typeof value === "number" && Number.isFinite(value)) date = new Date(value > 100_000_000_000 ? value : value * 1_000);
  else if (typeof value === "string" && value.trim()) date = new Date(value);
  else return null;
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeMarketNews(raw: unknown, limit: number): MarketNewsItem[] {
  if (!Array.isArray(raw)) return [];
  const items: MarketNewsItem[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const link = typeof record.link === "string" ? record.link.trim() : "";
    if (!title || !link) continue;
    items.push({ title, link, publisher: typeof record.publisher === "string" ? record.publisher : null, publishedAt: publishedAt(record.providerPublishTime) });
    if (items.length >= limit) break;
  }
  return items;
}
