import { withTimeout } from "@/lib/asyncTimeout";

export class RequestCapacityError extends Error {
  constructor() { super("Too many requests are already loading. Try again shortly."); }
}

/** Small process-local cache for public data; concurrent readers share one upstream request. */
export function createSharedRequestCache<T>(options: { ttlMs: number; timeoutMs: number; maxEntries?: number }) {
  const entries = new Map<string, { promise: Promise<T>; expiresAt: number; settled: boolean }>();
  const limit = options.maxEntries ?? 64;
  return (key: string, load: () => Promise<T>): Promise<T> => {
    const now = Date.now();
    const previous = entries.get(key);
    if (previous && (!previous.settled || previous.expiresAt > now)) return previous.promise;
    if (previous) entries.delete(key);
    for (const [entryKey, entry] of entries) {
      if (entry.settled && entry.expiresAt <= now) entries.delete(entryKey);
    }
    if (entries.size >= limit) {
      const oldestSettled = [...entries].find(([, entry]) => entry.settled);
      if (oldestSettled) entries.delete(oldestSettled[0]);
      else return Promise.reject(new RequestCapacityError());
    }
    const entry = { promise: null as unknown as Promise<T>, expiresAt: 0, settled: false, sourceFinished: false, failed: false };
    const source = Promise.resolve().then(load);
    const remove = () => { if (entries.get(key) === entry) entries.delete(key); };
    // A response timeout cannot cancel every provider SDK. Keep its real source
    // in the capacity/dedupe set until it stops, so retries cannot pile up work.
    void source.then(() => {
      entry.sourceFinished = true;
      if (entry.failed) remove();
    }, () => {
      entry.sourceFinished = true;
      remove();
    });
    entry.promise = withTimeout(source, options.timeoutMs, "Market data request")
      .then((value) => {
        entry.settled = true;
        entry.expiresAt = Date.now() + options.ttlMs;
        return value;
      }, (error) => {
        entry.failed = true;
        if (entry.sourceFinished) remove();
        throw error;
      });
    entries.set(key, entry);
    return entry.promise;
  };
}
