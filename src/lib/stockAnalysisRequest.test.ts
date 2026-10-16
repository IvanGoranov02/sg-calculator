import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStockAnalysisJobs, stockAnalysisStreamResponse } from "@/lib/stockAnalysisRequest";
import { RequestCapacityError } from "@/lib/sharedRequestCache";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

describe("stock analysis shared streaming requests", () => {
  it("shares identical active loads but keeps forced refreshes separate", async () => {
    let calls = 0;
    const pending: Array<() => void> = [];
    const jobs = createStockAnalysisJobs(async (symbol, options) => {
      calls += 1;
      await new Promise<void>((resolve) => pending.push(resolve));
      return { bundle: { symbol, forceRefresh: options.forceRefresh }, error: null };
    });
    const first = jobs("aapl", false);
    assert.equal(jobs("AAPL", false), first);
    const forced = jobs("AAPL", true);
    assert.notEqual(forced, first);
    await Promise.resolve();
    assert.equal(calls, 2);
    for (const finish of pending) finish();
    await Promise.all([first.result, forced.result]);
  });

  it("cancels one response without failing the source load or the other response", async () => {
    let progress!: (event: StockAnalysisLoadProgress) => void;
    let finish!: () => void;
    const jobs = createStockAnalysisJobs(async (_symbol, options) => {
      progress = options.onProgress;
      progress({ kind: "start" });
      await new Promise<void>((resolve) => { finish = resolve; });
      return { bundle: { symbol: "AAPL" }, error: null };
    });
    const job = jobs("AAPL", false);
    const first = stockAnalysisStreamResponse(job, new AbortController().signal);
    const second = stockAnalysisStreamResponse(job, new AbortController().signal);
    const reader = first.body!.getReader();
    const goodResponse = second.text();
    await reader.read();
    await reader.cancel();
    assert.doesNotThrow(() => progress({ kind: "yahoo_prices" }));
    finish();
    const output = await goodResponse;
    assert.match(output, /yahoo_prices/);
    assert.match(output, /"type":"done"/);
    assert.deepEqual(await job.result, { bundle: { symbol: "AAPL" }, error: null });
  });

  it("closes safely when the browser aborts before the shared load completes", async () => {
    let progress!: (event: StockAnalysisLoadProgress) => void;
    let finish!: () => void;
    const jobs = createStockAnalysisJobs(async (_symbol, options) => {
      progress = options.onProgress;
      await new Promise<void>((resolve) => { finish = resolve; });
      return { bundle: null, error: "test" };
    });
    const abort = new AbortController();
    const job = jobs("AAPL", false);
    const response = stockAnalysisStreamResponse(job, abort.signal);
    await Promise.resolve();
    abort.abort();
    assert.doesNotThrow(() => progress({ kind: "start" }));
    finish();
    assert.equal(await response.text(), "");
    await job.result;
  });

  it("returns a terminal timeout while tracking the actual source until it finishes", async () => {
    let finish!: () => void;
    let calls = 0;
    const jobs = createStockAnalysisJobs(async () => {
      calls += 1;
      await new Promise<void>((resolve) => { finish = resolve; });
      return { bundle: null, error: "test" };
    }, { timeoutMs: 10, maxPending: 1 });
    const job = jobs("AAPL", false);
    assert.throws(() => jobs("MSFT", false), RequestCapacityError);
    const response = stockAnalysisStreamResponse(job, new AbortController().signal);
    const text = await response.text();
    assert.match(text, /"type":"done"/);
    assert.match(text, /timed out/);
    assert.equal(jobs("AAPL", false), job);
    assert.equal(calls, 1);
    assert.throws(() => jobs("MSFT", false), RequestCapacityError);
    finish();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.doesNotThrow(() => jobs("MSFT", false));
    const next = jobs("MSFT", false);
    await Promise.resolve();
    finish();
    await next.result;
  });
});
