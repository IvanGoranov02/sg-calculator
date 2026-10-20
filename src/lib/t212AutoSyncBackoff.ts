const AUTO_SYNC_BACKOFF_MS = 10 * 60 * 1000;
const MAX_FAILURES = 1000;
const failures = new Map<string, number>();

export function shouldAttemptAutoSync(userId: string, nowMs = Date.now()): boolean {
  const failedAt = failures.get(userId);
  return failedAt === undefined || nowMs - failedAt >= AUTO_SYNC_BACKOFF_MS;
}

export function recordAutoSyncFailure(userId: string, nowMs = Date.now()): void {
  for (const [id, failedAt] of failures) {
    if (nowMs - failedAt >= AUTO_SYNC_BACKOFF_MS) failures.delete(id);
  }
  failures.delete(userId);
  failures.set(userId, nowMs);
  if (failures.size > MAX_FAILURES) {
    failures.delete(failures.keys().next().value!);
  }
}

export function clearAutoSyncFailure(userId: string): void {
  failures.delete(userId);
}
