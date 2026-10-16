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
  AppLocale,
  getMessage,
  interpolate,
  LOCALE_STORAGE_KEY,
} from "@/lib/i18n/messages";
import { createBrowserPreference } from "@/lib/preferences/browserPreference";

const localePreference = createBrowserPreference<AppLocale>({
  storageKey: LOCALE_STORAGE_KEY,
  eventName: "sg-locale-changed",
  defaultValue: "en",
  values: ["en", "bg"],
});

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(localePreference.subscribe, localePreference.read, () => "en" as AppLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "bg" ? "bg" : "en";
    const title = getMessage(locale, "meta.title") ?? getMessage("en", "meta.title");
    if (title) document.title = title;
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    localePreference.write(next);
  }, []);

  const t = useCallback(
    (path: string, vars?: Record<string, string | number>) => {
      let s = getMessage(locale, path) ?? getMessage("en", path) ?? path;
      if (vars) s = interpolate(s, vars);
      return s;
    },
    [locale],
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within LocaleProvider");
  }
  return ctx;
}
