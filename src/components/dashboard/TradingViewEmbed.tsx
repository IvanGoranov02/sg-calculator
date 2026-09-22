"use client";

import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

type TradingViewEmbedProps = {
  scriptSrc: string;
  config: Record<string, unknown>;
  height: number;
  className?: string;
};

/**
 * TradingView embed widgets read JSON from the script tag's own text.
 * next/script cannot attach that payload, so we inject the official snippet.
 */
export function TradingViewEmbed({ scriptSrc, config, height, className }: TradingViewEmbedProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const configJson = JSON.stringify(config);
  const reactId = useId();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    widget.style.height = "calc(100% - 1.5rem)";
    widget.style.width = "100%";

    const credit = document.createElement("div");
    credit.className = "tradingview-widget-copyright";
    credit.innerHTML =
      '<a href="https://www.tradingview.com/" rel="noopener nofollow" target="_blank"><span class="blue-text">Track all markets on TradingView</span></a>';

    const script = document.createElement("script");
    script.src = scriptSrc;
    script.type = "text/javascript";
    script.async = true;
    script.text = configJson;

    host.replaceChildren(widget, credit, script);

    return () => {
      host.replaceChildren();
    };
  }, [scriptSrc, configJson, reactId]);

  return (
    <div
      ref={hostRef}
      className={cn("tradingview-widget-container overflow-hidden bg-card", className)}
      style={{ height, width: "100%" }}
    />
  );
}
