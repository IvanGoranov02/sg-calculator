/**
 * Shared helpers for per-user rolling-TTL browser caches
 * (Portfolio holdings 1h, Events tab 24h).
 */

export type ClientTtlCacheRecord<T> = {
  userId: string;
  /** Epoch ms when the payload was fetched. */
  fetchedAt: number;
  /** Optional scope (e.g. sorted symbols) — miss when it changes. */
  scopeKey?: string;
  payload: T;
};

export type ClientTtlMemory<T> = ClientTtlCacheRecord<T> & {
  reloadToken: number;
  liveRefreshToken: number;
};

export type TtlLoadAction = "reuse" | "fetch" | "force";

export type TtlLoadDecision<T> = {
  action: TtlLoadAction;
  payload: T | null;
  /** Set when a still-fresh stored record should become this tab's session memory. */
  adoptMemory: ClientTtlMemory<T> | null;
};

export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

export function isFreshTtlRecord(
  record: { userId: string; fetchedAt: number; scopeKey?: string } | null,
  userId: string,
  ttlMs: number,
  nowMs: number,
  scopeKey?: string,
): boolean {
  if (!record || record.userId !== userId) return false;
  if (!Number.isFinite(record.fetchedAt) || record.fetchedAt <= 0) return false;
  if (nowMs - record.fetchedAt > ttlMs) return false;
  if (scopeKey !== undefined && (record.scopeKey ?? "") !== scopeKey) return false;
  return true;
}

export function decideClientTtlLoad<T>(input: {
  userId: string;
  ttlMs: number;
  reloadToken: number;
  liveRefreshToken: number;
  nowMs?: number;
  scopeKey?: string;
  memory: ClientTtlMemory<T> | null;
  stored: ClientTtlCacheRecord<T> | null;
}): TtlLoadDecision<T> {
  const nowMs = input.nowMs ?? Date.now();
  const memory = isFreshTtlRecord(input.memory, input.userId, input.ttlMs, nowMs, input.scopeKey)
    ? input.memory
    : null;
  const stored = isFreshTtlRecord(input.stored, input.userId, input.ttlMs, nowMs, input.scopeKey)
    ? input.stored
    : null;
  const payload = memory?.payload ?? stored?.payload ?? null;

  if (memory && input.liveRefreshToken > memory.liveRefreshToken) {
    return { action: "force", payload, adoptMemory: null };
  }
  if (memory && input.reloadToken > memory.reloadToken) {
    return { action: "fetch", payload, adoptMemory: null };
  }
  if (memory) {
    return { action: "reuse", payload: memory.payload, adoptMemory: null };
  }

  if (stored) {
    if (input.liveRefreshToken > 0) {
      return { action: "force", payload: stored.payload, adoptMemory: null };
    }
    if (input.reloadToken > 0) {
      return { action: "fetch", payload: stored.payload, adoptMemory: null };
    }
    return {
      action: "reuse",
      payload: stored.payload,
      adoptMemory: {
        ...stored,
        reloadToken: input.reloadToken,
        liveRefreshToken: input.liveRefreshToken,
      },
    };
  }

  return {
    action: input.liveRefreshToken > 0 ? "force" : "fetch",
    payload: null,
    adoptMemory: null,
  };
}

export function parseClientTtlCacheRecord<T>(
  raw: string | null,
  isUsablePayload: (value: unknown) => boolean,
): ClientTtlCacheRecord<T> | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!isRecord(data)) return null;
    if (typeof data.userId !== "string" || !data.userId) return null;
    if (typeof data.fetchedAt !== "number" || !Number.isFinite(data.fetchedAt)) return null;
    if (data.scopeKey != null && typeof data.scopeKey !== "string") return null;
    if (!isUsablePayload(data.payload)) return null;
    return {
      userId: data.userId,
      fetchedAt: data.fetchedAt,
      scopeKey: typeof data.scopeKey === "string" ? data.scopeKey : undefined,
      payload: data.payload as T,
    };
  } catch {
    return null;
  }
}

export function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredClientTtlCache<T>(
  storage: KeyValueStorage | null,
  storageKey: string,
  userId: string,
  isUsablePayload: (value: unknown) => boolean,
): ClientTtlCacheRecord<T> | null {
  if (!storage || !userId) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKey);
  } catch {
    return null;
  }
  const parsed = parseClientTtlCacheRecord<T>(raw, isUsablePayload);
  if (!parsed) {
    if (raw) {
      try {
        storage.removeItem?.(storageKey);
      } catch {
        // Ignore private-mode storage failures.
      }
    }
    return null;
  }
  if (parsed.userId !== userId) {
    try {
      storage.removeItem?.(storageKey);
    } catch {
      // Ignore private-mode storage failures.
    }
    return null;
  }
  return parsed;
}

export function writeStoredClientTtlCache<T>(
  storage: KeyValueStorage | null,
  storageKey: string,
  record: ClientTtlCacheRecord<T>,
): void {
  if (!storage) return;
  try {
    storage.setItem(storageKey, JSON.stringify(record));
  } catch {
    // Quota or private mode — session memory still covers this tab.
  }
}

export function removeStoredClientTtlCache(storage: KeyValueStorage | null, storageKey: string): void {
  if (!storage) return;
  try {
    storage.removeItem?.(storageKey);
  } catch {
    // Ignore private-mode storage failures.
  }
}
