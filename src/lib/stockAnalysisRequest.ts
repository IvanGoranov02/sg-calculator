import { withTimeout } from "@/lib/asyncTimeout";
import { RequestCapacityError } from "@/lib/sharedRequestCache";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

type Result = { bundle: unknown; error: string | null };
type ProgressListener = (progress: StockAnalysisLoadProgress) => void;
export type StockAnalysisJob = { result: Promise<Result>; subscribe: (listener: ProgressListener) => () => void };
type Loader = (ticker: string, options: { forceRefresh: boolean; onProgress: ProgressListener }) => Promise<Result>;

/** Share only active, identically configured public stock loads. Authorization stays in the route. */
export function createStockAnalysisJobs(load: Loader, options: { timeoutMs?: number; maxPending?: number } = {}) {
  const pending = new Map<string, StockAnalysisJob>();
  return (ticker: string, forceRefresh: boolean): StockAnalysisJob => {
    const symbol = ticker.trim().toUpperCase();
    const key = JSON.stringify([symbol, forceRefresh]);
    const existing = pending.get(key);
    if (existing) return existing;
    if (pending.size >= (options.maxPending ?? 32)) throw new RequestCapacityError();
    const listeners = new Set<ProgressListener>();
    let latest: StockAnalysisLoadProgress | null = null;
    const notify: ProgressListener = (progress) => {
      latest = progress;
      for (const listener of listeners) {
        // A disconnected response must never fail the shared source/cache work.
        try { listener(progress); } catch { listeners.delete(listener); }
      }
    };
    const source = Promise.resolve().then(() => load(symbol, { forceRefresh, onProgress: notify }));
    const job: StockAnalysisJob = {
      result: withTimeout(
        source,
        options.timeoutMs ?? 110_000,
        "Stock data request",
      ).catch((error: unknown) => ({ bundle: null, error: error instanceof Error ? error.message : "Could not load stock data." }))
        .then((result) => {
          listeners.clear();
          return result;
        }),
      subscribe(listener) {
        listeners.add(listener);
        if (latest) {
          try { listener(latest); } catch { listeners.delete(listener); }
        }
        return () => { listeners.delete(listener); };
      },
    };
    pending.set(key, job);
    // Keep timed-out but still-running work tracked as well: a retry must not
    // launch another paid/provider load while the original source is active.
    const release = () => { if (pending.get(key) === job) pending.delete(key); };
    void source.then(release, release);
    return job;
  };
}

/** Browser cancellation detaches its progress sink, leaving other subscribers intact. */
export function stockAnalysisStreamResponse(job: StockAnalysisJob, signal: AbortSignal): Response {
  const encoder = new TextEncoder();
  let stopped = false;
  let unsubscribe = () => {};
  let removeAbort = () => {};
  const detach = () => { unsubscribe(); removeAbort(); };
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (stopped) return;
        stopped = true;
        detach();
        try { controller.close(); } catch { /* Consumer may already have canceled. */ }
      };
      const send = (line: unknown) => {
        if (stopped) return;
        try { controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`)); }
        catch { close(); }
      };
      if (signal.aborted) { close(); return; }
      signal.addEventListener("abort", close, { once: true });
      removeAbort = () => signal.removeEventListener("abort", close);
      unsubscribe = job.subscribe((payload) => send({ type: "progress", payload }));
      void job.result.then((result) => {
        send({ type: "done", ...result });
        close();
      }, (error: unknown) => {
        send({ type: "done", bundle: null, error: error instanceof Error ? error.message : "Could not load stock data." });
        close();
      });
    },
    cancel() {
      stopped = true;
      detach();
    },
  });
  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
