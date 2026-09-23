/** User-facing copy for Trading 212 API failures (English; UI may wrap with i18n titles). */

const LEGACY_PREFIX = /^Trading 212 (\d{3})(?::\s*(.*))?$/i;

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
  if (/unauthorized/i.test(text) && text.length < 120) {
    return trading212UserErrorMessage(401);
  }
  return text;
}

export function isTrading212AuthFailure(
  status: number | null | undefined,
  message: string | null | undefined,
): boolean {
  if (status === 401 || status === 403) return true;
  const normalized = normalizeTrading212ErrorMessage(message);
  if (!normalized) return false;
  if (LEGACY_PREFIX.test(message ?? "")) {
    const code = Number(LEGACY_PREFIX.exec(message ?? "")?.[1]);
    return code === 401 || code === 403;
  }
  return /rejected the saved API credentials|denied access with the current API key/i.test(normalized);
}

export function looksLikeTrading212ErrorMessage(message: string | null | undefined): boolean {
  if (!message?.trim()) return false;
  if (LEGACY_PREFIX.test(message.trim())) return true;
  if (/Trading 212/i.test(message)) return true;
  return isTrading212AuthFailure(null, message);
}
