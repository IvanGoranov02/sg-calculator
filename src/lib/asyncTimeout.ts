/**
 * Promise timeouts and retries for I/O that otherwise has no deadline
 * (Yahoo fetch, Prisma pooler, optional Gemini gap-fill).
 */

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isTimeoutError(e: unknown): e is TimeoutError {
  return e instanceof TimeoutError || (e instanceof Error && e.name === "TimeoutError");
}

/**
 * Race `promise` against a timer. Does not cancel the underlying work unless
 * that work observes its own AbortSignal.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(`withTimeout: timeoutMs must be positive, got ${timeoutMs}`);
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Like {@link withTimeout} but returns `fallback` instead of throwing. */
export async function withTimeoutFallback<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  fallback: T,
): Promise<T> {
  try {
    return await withTimeout(promise, timeoutMs, label);
  } catch (e) {
    if (isTimeoutError(e)) return fallback;
    throw e;
  }
}

export type RetryOptions = {
  attempts: number;
  timeoutMs: number;
  label: string;
  /** Default: retry every error (including timeout). */
  retryIf?: (error: unknown) => boolean;
  delayMs?: number;
};

/**
 * Run `fn` up to `attempts` times, each attempt bounded by `timeoutMs`.
 * `fn` is called fresh each attempt so callers can open a new query.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const attempts = Math.max(1, Math.floor(opts.attempts));
  const delayMs = opts.delayMs ?? 0;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await withTimeout(fn(), opts.timeoutMs, opts.label);
    } catch (e) {
      lastError = e;
      const canRetry = i < attempts - 1 && (opts.retryIf ? opts.retryIf(e) : true);
      if (!canRetry) throw e;
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

/** `fetch` that always aborts after `timeoutMs` (per request, not per client lifetime). */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError(`fetchWithTimeout: timeoutMs must be positive, got ${timeoutMs}`);
  }
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(input, { ...init, signal });
  };
}
