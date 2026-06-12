"use client";

import { useEffect, useRef } from "react";

/**
 * Runs `callback` every `intervalMs` while the tab is visible. Skips ticks in
 * background tabs and fires immediately when the user returns to a tab that
 * missed at least one tick — keeps quotes fresh without wasted requests.
 */
export function useVisibleInterval(callback: () => void, intervalMs: number, enabled = true): void {
  const cbRef = useRef(callback);
  useEffect(() => {
    cbRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    let lastRun = Date.now();

    const tick = () => {
      if (document.visibilityState !== "visible") return;
      lastRun = Date.now();
      cbRef.current();
    };

    const id = setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRun >= intervalMs) {
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
