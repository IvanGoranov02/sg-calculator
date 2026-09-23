/** User-facing copy for Trading 212 API failures (English; UI may wrap with i18n titles). */

const LEGACY_PREFIX = /^Trading 212 (\d{3})(?:\s*:?\s*(.*))?$/i;

export function trading212ErrorHttpStatus(message: string | null | undefined): number | null {
  const legacy = LEGACY_PREFIX.exec(message?.trim() ?? "");
  if (!legacy) return null;
  const status = Number(legacy[1]);
  return Number.isFinite(status) ? status : null;
}

export function trading212UserErrorMessage(status: number, detail?: string): string {
  const trimmedDetail = detail?.trim();
  switch (status) {
    case 401:
      return (
        "Trading 212 rejected the saved API credentials (unauthorized). " +
        "If you revoked or recreated the key in Trading 212, enter a new API key and secret below to reconnect."
      );
    case 403:
      return (
        "Trading 212 denied access with the current API key (forbidden). " +
        "Check key permissions and any IP allowlist in the Trading 212 app, then reconnect."
      );
    case 429:
      return "Trading 212 rate limit exceeded. Wait a few minutes and try syncing again.";
    default:
      if (status >= 500) {
        return `Trading 212 is temporarily unavailable (${status}). Try again later.`;
      }
      if (trimmedDetail) {
        return `Trading 212 request failed (${status}): ${trimmedDetail.slice(0, 400)}`;
      }
      return `Trading 212 request failed (${status}).`;
  }
}

/** Map stored or legacy broker error strings to readable copy. */
export function normalizeTrading212ErrorMessage(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const text = raw.trim();
  const legacy = LEGACY_PREFIX.exec(text);
  if (legacy) {
    const status = Number(legacy[1]);
    const detail = legacy[2] ?? "";
    if (Number.isFinite(status)) return trading212UserErrorMessage(status, detail);
  }
  return text;
}

function isAppSessionUnauthorizedMessage(message: string): boolean {
  return /^unauthorized$/i.test(message.trim());
}

/** True only for broker 401/403 / revoked-key style failures — not rate limits, 5xx, or app session auth. */
export function isTrading212AuthFailure(
  status: number | null | undefined,
  message: string | null | undefined,
): boolean {
  if (status === 401 || status === 403) return true;
  if (status != null && status !== 401 && status !== 403) return false;

  const msg = message?.trim();
  if (!msg) return false;
  if (isAppSessionUnauthorizedMessage(msg)) return false;

  const legacyStatus = trading212ErrorHttpStatus(msg);
  if (legacyStatus != null) {
    return legacyStatus === 401 || legacyStatus === 403;
  }

  const normalized = normalizeTrading212ErrorMessage(msg);
  if (!normalized) return false;

  return /rejected the saved API credentials|denied access with the current API key/i.test(normalized);
}

export function looksLikeTrading212ErrorMessage(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  if (LEGACY_PREFIX.test(message.trim())) return true;
  if (/Trading 212/i.test(message)) return true;
  return isTrading212AuthFailure(null, message);
}
