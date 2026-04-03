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

const LOCALE_EVENT = "sg-locale-changed";

function readLocale(): AppLocale {
  if (typeof window === "undefined") return "en";
  const v = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return v === "bg" ? "bg" : "en";
}

function subscribeLocale(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCALE_STORAGE_KEY) onChange();
  };
  const onLocal = () => onChange();
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCALE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCALE_EVENT, onLocal);
  };
}

function getLocaleSnapshot(): AppLocale {
  return readLocale();
}

function persistLocale(locale: AppLocale): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  window.dispatchEvent(new Event(LOCALE_EVENT));
}

type I18nContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (path: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, getLocaleSnapshot, () => "en" as AppLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "bg" ? "bg" : "en";
    const title = getMessage(locale, "meta.title") ?? getMessage("en", "meta.title");
    if (title) document.title = title;
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    persistLocale(next);
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
