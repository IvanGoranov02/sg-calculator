import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";
import { fetchStockAnalysisStream, readStockAnalysisStream } from "@/lib/stockAnalysisStreamClient";

const encoder = new TextEncoder();

function bundle(): StockAnalysisBundle {
  return {
    quote: { symbol: "TEST", name: "Тест 🏦", price: 10, change: 1, changesPercentage: 2 },
    income: [], cashFlow: [], balanceSheet: [], historical: [],
    investor: { currency: "USD" } as StockAnalysisBundle["investor"],
    incomeQuarterly: [], cashFlowQuarterly: [], balanceSheetQuarterly: [], dividendQuarterly: [],
  };
}

function terminal(data: StockAnalysisBundle | null = bundle(), error: string | null = null): string {
  return JSON.stringify({ type: "done", bundle: data, error });
}

function responseFromChunks(chunks: Uint8Array[]): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }));
}

describe("stock analysis NDJSON client", () => {
  it("handles arbitrary byte boundaries, split UTF-8, CRLF, and multiple messages", async () => {
    const text = `\r\n${JSON.stringify({ type: "progress", payload: { kind: "start" } })}\r\n` +
      `${JSON.stringify({ type: "progress", payload: { kind: "gemini", step: 2, total: 3 } })}\n${terminal()}\n`;
    const bytes = encoder.encode(text);
    const progress: StockAnalysisLoadProgress[] = [];
    const result = await readStockAnalysisStream(responseFromChunks(Array.from(bytes, (byte) => Uint8Array.of(byte))), {
      onProgress: (event) => progress.push(event),
    });
    assert.deepEqual(result, { bundle: bundle(), error: null });
    assert.deepEqual(progress, [{ kind: "start" }, { kind: "gemini", step: 2, total: 3 }]);
  });

  it("accepts a terminal message without a trailing newline", async () => {
    assert.deepEqual(await readStockAnalysisStream(new Response(terminal(null, "Provider unavailable"))), {
      bundle: null, error: "Provider unavailable",
    });
  });

  it("rejects progress-only EOF instead of silently reporting success", async () => {
    await assert.rejects(
      readStockAnalysisStream(new Response('{"type":"progress","payload":{"kind":"yahoo_prices"}}\n')),
      /ended before loading finished/,
    );
  });

  it("rejects an empty stream and an unreadable body", async () => {
    await assert.rejects(readStockAnalysisStream(new Response("")), /ended before loading finished/);
    await assert.rejects(readStockAnalysisStream(new Response(null)), /no readable body/);
  });

  it("rejects corrupt JSON and invalid progress or terminal shapes", async () => {
    const invalid = [
      "{truncated", "null", "[]", '{"type":"unknown"}',
      '{"type":"progress","payload":null}',
      '{"type":"progress","payload":{"kind":"gemini","step":4,"total":3}}',
      '{"type":"done","error":null}',
      '{"type":"done","bundle":{},"error":null}',
      '{"type":"done","bundle":null,"error":123}',
    ];
    for (const text of invalid) {
      await assert.rejects(readStockAnalysisStream(new Response(`${text}\n`)), /Invalid stock data response/, text);
    }
  });

  it("finishes on done even when the server leaves its stream open, and releases the reader", async () => {
    let cancelled = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode(`${terminal()}\n`)); },
      cancel() { cancelled++; },
    }));
    const result = await readStockAnalysisStream(response);
    assert.equal(result.bundle?.quote.symbol, "TEST");
    assert.equal(cancelled, 1);
    assert.equal(response.body?.locked, false);
  });

  it("does not deliver progress after terminal done", async () => {
    let progress = 0;
    await readStockAnalysisStream(new Response(`${terminal()}\n{"type":"progress","payload":{"kind":"start"}}\n`), {
      onProgress: () => { progress++; },
    });
    assert.equal(progress, 0);
  });

  it("cancels a pending reader on abort without delivering another progress event", async () => {
    const ac = new AbortController();
    let cancelled = 0;
    let progress = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"progress","payload":{"kind":"start"}}\n'));
      },
      cancel() { cancelled++; },
    }));
    const result = readStockAnalysisStream(response, {
      signal: ac.signal,
      onProgress: () => { progress++; ac.abort(); },
    });
    await assert.rejects(result, { name: "AbortError" });
    assert.equal(progress, 1);
    assert.equal(cancelled, 1);
    assert.equal(response.body?.locked, false);
  });

  it("fails a stalled body within its deadline, even when transport cancellation hangs", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; return new Promise(() => {}); },
    }));
    await assert.rejects(readStockAnalysisStream(response, { timeoutMs: 10 }), /timed out/);
    assert.equal(cancelled, true);
    assert.equal(response.body?.locked, false);
  });

  it("ignores a done message in the same chunk after progress cancels the request", async () => {
    const ac = new AbortController();
    const response = new Response(`{"type":"progress","payload":{"kind":"start"}}\n${terminal()}\n`);
    await assert.rejects(readStockAnalysisStream(response, {
      signal: ac.signal, onProgress: () => ac.abort(),
    }), { name: "AbortError" });
    assert.equal(response.body?.locked, false);
  });

  it("cancels and releases a stalled HTTP error body on deadline", async () => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled = true; },
    }), { status: 502 });
    await assert.rejects(readStockAnalysisStream(response, { timeoutMs: 10 }), /timed out/);
    assert.equal(cancelled, true);
    assert.equal(response.body?.locked, false);
  });

  it("releases its reader on malformed input and transport errors", async () => {
    let cancelled = false;
    const malformed = new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(encoder.encode("not JSON\n")); },
      cancel() { cancelled = true; },
    }));
    await assert.rejects(readStockAnalysisStream(malformed), /Invalid stock data response/);
    assert.equal(cancelled, true);
    assert.equal(malformed.body?.locked, false);

    const broken = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { controller.error(new Error("Connection reset")); },
    }));
    await assert.rejects(readStockAnalysisStream(broken), /Connection reset/);
    assert.equal(broken.body?.locked, false);
  });

  it("retains HTTP error messages and handles HTML error pages", async () => {
    await assert.rejects(readStockAnalysisStream(Response.json({ error: "Too many requests" }, { status: 429 })), /Too many requests/);
    await assert.rejects(readStockAnalysisStream(new Response("<html>Unavailable</html>", { status: 503 })), /HTTP 503/);
  });

  it("bounds a request waiting for headers and aborts its fetch signal", async () => {
    let fetchSignal: AbortSignal | null | undefined;
    const fetcher: typeof fetch = async (_url, init) => {
      fetchSignal = init?.signal;
      return new Promise<Response>(() => {});
    };
    await assert.rejects(fetchStockAnalysisStream("/api/stock-analysis", { fetcher, timeoutMs: 10 }), /timed out/);
    assert.equal(fetchSignal?.aborted, true);
  });

  it("does not start a fetch after its caller has already cancelled", async () => {
    const ac = new AbortController();
    ac.abort();
    let calls = 0;
    const fetcher: typeof fetch = async () => { calls++; return new Response(terminal()); };
    await assert.rejects(fetchStockAnalysisStream("/api/stock-analysis", { fetcher, signal: ac.signal }), { name: "AbortError" });
    assert.equal(calls, 0);
  });

  it("uses the fetch wrapper for a complete streaming request", async () => {
    const events: StockAnalysisLoadProgress[] = [];
    const fetcher: typeof fetch = async (_url, init) => {
      assert.equal(init?.signal?.aborted, false);
      return new Response(`{"type":"progress","payload":{"kind":"cache_hit"}}\n${terminal()}\n`);
    };
    const result = await fetchStockAnalysisStream("/api/stock-analysis?ticker=TEST", {
      fetcher, onProgress: (event) => events.push(event),
    });
    assert.equal(result.bundle?.quote.name, "Тест 🏦");
    assert.deepEqual(events, [{ kind: "cache_hit" }]);
  });
});
