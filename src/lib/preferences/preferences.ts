import { createBrowserPreference } from "@/lib/preferences/browserPreference";

export const THEME_STORAGE_KEY = "sg-theme-v1";
export const DISPLAY_CURRENCY_STORAGE_KEY = "sg-stock-price-ccy-v1";
export const DATE_FORMAT_STORAGE_KEY = "sg-date-format-v1";

export type AppTheme = "light" | "dark";
export type DisplayCurrency = "usd" | "eur";
/** European DD/MM/YYYY vs American MM/DD/YYYY */
export type DateFormat = "dmy" | "mdy";

export const themePreference = createBrowserPreference<AppTheme>({
  storageKey: THEME_STORAGE_KEY,
  eventName: "sg-theme-changed",
  defaultValue: "dark",
  values: ["dark", "light"],
});

export const displayCurrencyPreference = createBrowserPreference<DisplayCurrency>({
  storageKey: DISPLAY_CURRENCY_STORAGE_KEY,
  eventName: "sg-currency-changed",
  defaultValue: "usd",
  values: ["usd", "eur"],
});

export const dateFormatPreference = createBrowserPreference<DateFormat>({
  storageKey: DATE_FORMAT_STORAGE_KEY,
  eventName: "sg-date-format-changed",
  defaultValue: "mdy",
  values: ["mdy", "dmy"],
});

export const readStoredTheme = themePreference.read;
export const readStoredDisplayCurrency = displayCurrencyPreference.read;
export const readStoredDateFormat = dateFormatPreference.read;

export function displayCurrencyToPortfolioCode(currency: DisplayCurrency): "EUR" | "USD" {
  return currency === "eur" ? "EUR" : "USD";
}
