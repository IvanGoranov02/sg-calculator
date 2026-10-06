/**
 * Server-side helpers for Portfolio / Events response cache headers.
 */

export const PORTFOLIO_HOLDINGS_SERVER_MAX_AGE_SEC = 60 * 60;
export const EVENTS_SERVER_MAX_AGE_SEC = 24 * 60 * 60;

export function requestWantsRefresh(url: string | URL): boolean {
  const value = new URL(url).searchParams.get("refresh");
  return value === "1" || value === "true";
}

/** Browser-private cache; bypassed when the client requests a forced refresh. */
export function privateTtlCacheControl(maxAgeSec: number, refresh: boolean): string {
  if (refresh) return "private, no-store";
  return `private, max-age=${maxAgeSec}, stale-while-revalidate=${Math.min(maxAgeSec, 300)}`;
}
