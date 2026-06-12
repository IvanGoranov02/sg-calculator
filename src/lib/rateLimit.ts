/**
 * In-memory fixed-window rate limiter for API route handlers.
 *
 * State lives per server instance (per warm serverless worker), so limits are
 * approximate under horizontal scaling — good enough to stop hammering of the
 * paid Gemini/Yahoo paths without external infrastructure. Swap the store for
 * Redis/Upstash if exact global limits become necessary.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Sweep expired buckets occasionally so the map cannot grow without bound. */
const SWEEP_THRESHOLD = 10_000;

function sweepExpired(now: number): void {
  if (buckets.size < SWEEP_THRESHOLD) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number };

/**
 * Count a hit against `name:key` and report whether it is within `limit`
 * requests per `windowMs`.
 */
export function checkRateLimit(
  name: string,
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);
  const mapKey = `${name}:${key}`;
  const bucket = buckets.get(mapKey);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(mapKey, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (bucket.count < limit) {
    bucket.count += 1;
    return { ok: true };
  }
  return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
}

/** Stable client key: user id when signed in, else best-effort client IP. */
export function clientKeyFromRequest(request: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim();
  return ip ? `ip:${ip}` : "anon";
}

export function rateLimitResponse(retryAfterSec: number): Response {
  return Response.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
  );
}
