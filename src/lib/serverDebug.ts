/**
 * Server-side progress logging for the stock pipeline. Quiet in production (Vercel logs stay
 * readable for real errors); set `STOCK_DEBUG_LOG=1` in the environment to turn it back on.
 */
export function debugLog(message: string): void {
  if (process.env.NODE_ENV !== "production" || process.env.STOCK_DEBUG_LOG === "1") {
    console.log(message);
  }
}
