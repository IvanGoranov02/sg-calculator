/**
 * Shared yahoo-finance2 client with a per-request fetch timeout.
 * Do not put AbortSignal.timeout() on the constructor's fetchOptions —
 * that signal fires from instance creation, not from each request.
 */

import YahooFinance from "yahoo-finance2";

import { fetchWithTimeout } from "@/lib/asyncTimeout";

/** Yahoo quote/history/fundamentals calls must not block the stock stream. */
export const YAHOO_FETCH_TIMEOUT_MS = 12_000;

export const yahooFinance = new YahooFinance({
  suppressNotices: ["ripHistorical", "yahooSurvey"],
  queue: { concurrency: 8 },
  fetch: fetchWithTimeout(YAHOO_FETCH_TIMEOUT_MS),
});
