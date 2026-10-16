import type { StockAnalysisBundle } from "@/lib/stockAnalysisTypes";
import type { StockAnalysisLoadProgress } from "@/lib/stockLoadProgress";

export const STOCK_ANALYSIS_CLIENT_TIMEOUT_MS = 125_000;

export type StockAnalysisStreamResult = {
  bundle: StockAnalysisBundle | null;
  error: string | null;
};

type StreamOptions = {
  signal?: AbortSignal;
  onProgress?: (progress: StockAnalysisLoadProgress) => void;
  timeoutMs?: number;
};

const INVALID_RESPONSE = "Invalid stock data response. Please try again.";
const INCOMPLETE_RESPONSE = "Stock data connection ended before loading finished. Please try again.";
const TIMEOUT_MESSAGE = "Stock data request timed out. Please try again.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProgress(value: unknown): value is StockAnalysisLoadProgress {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "start":
    case "cache_hit":
    case "fmp":
    case "edgar":
    case "gemini_gap_fill":
    case "yahoo_fundamentals":
    case "yahoo_prices":
      return true;
    case "gemini":
      return value.total === 3 && (value.step === 1 || value.step === 2 || value.step === 3);
    default:
      return false;
  }
}

/** Check the containers consumed by the stock view before accepting a terminal message. */
function isBundle(value: unknown): value is StockAnalysisBundle {
  if (!isRecord(value) || !isRecord(value.quote) || !isRecord(value.investor)) return false;
  return (
    typeof value.quote.symbol === "string" && value.quote.symbol.trim().length > 0 &&
    typeof value.quote.name === "string" &&
    typeof value.investor.currency === "string" &&
    ["income", "cashFlow", "balanceSheet", "historical", "incomeQuarterly", "cashFlowQuarterly", "balanceSheetQuarterly", "dividendQuarterly"]
      .every((key) => Array.isArray(value[key]))
  );
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Stock data request cancelled.", "AbortError");
}

/** Also bounds test/custom fetches and readers that do not observe AbortSignal themselves. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

async function withDeadline<T>(options: StreamOptions, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const timeoutMs = options.timeoutMs ?? STOCK_ANALYSIS_CLIENT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new RangeError("timeoutMs must be positive");
  const timeout = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal;
  const timer = setTimeout(() => timeout.abort(new Error(TIMEOUT_MESSAGE)), timeoutMs);
  try {
    signal.throwIfAborted();
    return await run(signal);
  } finally {
    clearTimeout(timer);
  }
}

async function readBody(
  response: Response,
  signal: AbortSignal,
  onProgress: StreamOptions["onProgress"],
): Promise<StockAnalysisStreamResult> {
  signal.throwIfAborted();
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(response.ok
      ? "Stock data response has no readable body. Please try again."
      : `Stock data request failed (HTTP ${response.status}).`);
  }

  const cancelReader = () => {
    try {
      // Do not await cancellation: a transport's cancel callback may itself hang.
      void reader.cancel().catch(() => {});
    } catch {
      // A transport may already have released or closed its reader.
    }
  };
  signal.addEventListener("abort", cancelReader, { once: true });

  function parseLine(line: string): StockAnalysisStreamResult | null {
    if (!line.trim()) return null;
    signal.throwIfAborted();
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      throw new Error(INVALID_RESPONSE);
    }
    if (!isRecord(message)) throw new Error(INVALID_RESPONSE);
    if (message.type === "progress" && isProgress(message.payload)) {
      signal.throwIfAborted();
      onProgress?.(message.payload);
      return null;
    }
    if (
      message.type === "done" &&
      (message.bundle === null || isBundle(message.bundle)) &&
      (message.error === null || typeof message.error === "string")
    ) {
      return { bundle: message.bundle, error: message.error };
    }
    throw new Error(INVALID_RESPONSE);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    if (!response.ok) {
      while (true) {
        const { done, value } = await abortable(reader.read(), signal);
        signal.throwIfAborted();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        if (done) break;
      }
      let data: unknown;
      try { data = JSON.parse(buffer); } catch { /* HTML/proxy errors use the HTTP status. */ }
      const message = isRecord(data) && typeof data.error === "string" && data.error.trim()
        ? data.error
        : `Stock data request failed (HTTP ${response.status}).`;
      throw new Error(message);
    }
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      signal.throwIfAborted();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const result = parseLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        if (result) return result;
      }
      if (done) {
        const result = parseLine(buffer);
        if (result) return result;
        throw new Error(INCOMPLETE_RESPONSE);
      }
    }
  } finally {
    signal.removeEventListener("abort", cancelReader);
    cancelReader();
    reader.releaseLock();
  }
}

/** Parse NDJSON through a terminal done message, including an unterminated final line at EOF. */
export function readStockAnalysisStream(response: Response, options: StreamOptions = {}): Promise<StockAnalysisStreamResult> {
  return withDeadline(options, (signal) => readBody(response, signal, options.onProgress));
}

/** One deadline covers both response headers and the streaming body. */
export function fetchStockAnalysisStream(
  url: string,
  options: StreamOptions & { fetcher?: typeof fetch } = {},
): Promise<StockAnalysisStreamResult> {
  return withDeadline(options, async (signal) => {
    const response = await abortable((options.fetcher ?? fetch)(url, { signal }), signal);
    return readBody(response, signal, options.onProgress);
  });
}
