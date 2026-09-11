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
  DISPLAY_CURRENCY_STORAGE_KEY,
  DisplayCurrency,
  readStoredDisplayCurrency,
  readStoredTheme,
  THEME_STORAGE_KEY,
} from "@/lib/preferences/preferences";

const THEME_EVENT = "sg-theme-changed";
const CURRENCY_EVENT = "sg-currency-changed";

function subscribeTheme(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY) onChange();
  };
  const onLocal = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(THEME_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(THEME_EVENT, onLocal);
  };
}

function subscribeCurrency(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === DISPLAY_CURRENCY_STORAGE_KEY) onChange();
  };
  const onLocal = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(CURRENCY_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CURRENCY_EVENT, onLocal);
  };
}

function applyThemeClass(theme: AppTheme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

type PreferencesContextValue = {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  displayCurrency: DisplayCurrency;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribeTheme, readStoredTheme, () => "dark" as AppTheme);
  const displayCurrency = useSyncExternalStore(
    subscribeCurrency,
    readStoredDisplayCurrency,
    () => "usd" as DisplayCurrency,
  );

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((next: AppTheme) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    applyThemeClass(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const setDisplayCurrency = useCallback((next: DisplayCurrency) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(DISPLAY_CURRENCY_STORAGE_KEY, next);
    window.dispatchEvent(new Event(CURRENCY_EVENT));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      displayCurrency,
      setDisplayCurrency,
    }),
    [theme, setTheme, displayCurrency, setDisplayCurrency],
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
