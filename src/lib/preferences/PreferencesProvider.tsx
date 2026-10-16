"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  AppTheme,
  DateFormat,
  DisplayCurrency,
  readStoredDateFormat,
  readStoredDisplayCurrency,
  readStoredTheme,
  themePreference,
  displayCurrencyPreference,
  dateFormatPreference,
} from "@/lib/preferences/preferences";

function applyThemeClass(theme: AppTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

type PreferencesContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  dateFormat: DateFormat;
  setDateFormat: (format: DateFormat) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(themePreference.subscribe, readStoredTheme, () => "dark" as AppTheme);
  const displayCurrency = useSyncExternalStore(
    displayCurrencyPreference.subscribe,
    readStoredDisplayCurrency,
    () => "usd" as DisplayCurrency,
  );
  const dateFormat = useSyncExternalStore(
    dateFormatPreference.subscribe,
    readStoredDateFormat,
    () => "mdy" as DateFormat,
  );

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((next: AppTheme) => {
    if (typeof window === "undefined") return;
    themePreference.write(next);
    applyThemeClass(next);
  }, []);

  const setDisplayCurrency = useCallback((next: DisplayCurrency) => {
    if (typeof window === "undefined") return;
    displayCurrencyPreference.write(next);
  }, []);

  const setDateFormat = useCallback((next: DateFormat) => {
    if (typeof window === "undefined") return;
    dateFormatPreference.write(next);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      displayCurrency,
      setDisplayCurrency,
      dateFormat,
      setDateFormat,
    }),
    [theme, setTheme, displayCurrency, setDisplayCurrency, dateFormat, setDateFormat],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return ctx;
}
