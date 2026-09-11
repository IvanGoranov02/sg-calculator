export const THEME_STORAGE_KEY = "sg-theme-v1";
export const DISPLAY_CURRENCY_STORAGE_KEY = "sg-stock-price-ccy-v1";
export const DATE_FORMAT_STORAGE_KEY = "sg-date-format-v1";

export type AppTheme = "light" | "dark";
export type DisplayCurrency = "usd" | "eur";
/** European DD/MM/YYYY vs American MM/DD/YYYY */
export type DateFormat = "dmy" | "mdy";

export function readStoredTheme(): AppTheme {
  if (typeof window === "undefined") return "dark";
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function readStoredDisplayCurrency(): DisplayCurrency {
  if (typeof window === "undefined") return "usd";
  try {
    const value = window.localStorage.getItem(DISPLAY_CURRENCY_STORAGE_KEY);
    if (value === "eur" || value === "usd") return value;
  } catch {
    /* ignore */
  }
  return "usd";
}

export function readStoredDateFormat(): DateFormat {
  if (typeof window === "undefined") return "mdy";
  try {
    const value = window.localStorage.getItem(DATE_FORMAT_STORAGE_KEY);
    if (value === "dmy" || value === "mdy") return value;
  } catch {
    /* ignore */
  }
  return "mdy";
}

export function displayCurrencyToPortfolioCode(currency: DisplayCurrency): "EUR" | "USD" {
  return currency === "eur" ? "EUR" : "USD";
}
