"use client";
import { useEffect, useSyncExternalStore } from "react";
import type { EditorialImage } from "@/lib/editorialContent";
export type SiteCopy = {
  en: Record<string, string>;
  bg: Record<string, string>;
  images: Record<string, EditorialImage>;
  version: string | null;
};
const empty: SiteCopy = { en: {}, bg: {}, images: {}, version: null };
let snapshot = empty;
let started = false;
const listeners = new Set<() => void>();
export function setSiteCopy(next: SiteCopy) {
  snapshot = next;
  for (const fn of listeners) fn();
}
export function useSiteCopy() {
  const data = useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => snapshot,
    () => empty,
  );
  useEffect(() => {
    if (started) return;
    started = true;
    void fetch("/api/site-content", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.copy) setSiteCopy(data.copy);
      })
      .catch(() => {});
  }, []);
  return data;
}
export function imageCopyKey(pathname: string, src: string) {
  let hash = 2166136261;
  for (let i = 0; i < src.length; i++)
    hash = Math.imul(hash ^ src.charCodeAt(i), 16777619);
  return `${pathname}:${(hash >>> 0).toString(16)}`;
}
