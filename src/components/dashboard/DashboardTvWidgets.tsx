"use client";

import { useMemo } from "react";

import { TradingViewEmbed } from "@/components/dashboard/TradingViewEmbed";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";

const OVERVIEW_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
const CHART_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const HEATMAP_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";

const PANEL_H = 580;
const HEATMAP_H = 520;
const WIDGET_CHROME = 28;

/** TradingView widget locale ids; bg maps to their bg_BG pack. */
function tvLocale(locale: string): string {
  return locale === "bg" ? "bg_BG" : "en";
}

export function DashboardTvWidgets() {
  const { t, locale } = useI18n();
  const { theme } = usePreferences();
  const colorTheme = theme === "light" ? "light" : "dark";
  const widgetLocale = tvLocale(locale);

  const overviewConfig = useMemo(
    () => ({
      colorTheme,
      dateRange: "12M",
      showChart: false,
      locale: widgetLocale,
      largeChartUrl: "",
      isTransparent: false,
      showSymbolLogo: true,
      showFloatingTooltip: true,
      width: "100%",
      height: PANEL_H - WIDGET_CHROME,
      plotLineColorGrowing: "rgba(34, 197, 94, 1)",
      plotLineColorFalling: "rgba(248, 113, 113, 1)",
      gridLineColor: "rgba(240, 243, 250, 0.06)",
      scaleFontColor: "rgba(209, 212, 220, 1)",
      belowLineFillColorGrowing: "rgba(34, 197, 94, 0.12)",
      belowLineFillColorFalling: "rgba(248, 113, 113, 0.12)",
      belowLineFillColorGrowingBottom: "rgba(34, 197, 94, 0)",
      belowLineFillColorFallingBottom: "rgba(248, 113, 113, 0)",
      symbolActiveColor: "rgba(34, 197, 94, 0.12)",
      tabs: [
        {
          title: t("dashboard.indicesTab"),
          originalTitle: "Indices",
          symbols: [
            { s: "FOREXCOM:SPXUSD", d: "S&P 500" },
            { s: "FOREXCOM:NSXUSD", d: "Nasdaq 100" },
            { s: "AMEX:SPY", d: "SPY" },
            { s: "NASDAQ:QQQ", d: "QQQ" },
            { s: "FOREXCOM:DJI", d: "Dow 30" },
            { s: "INDEX:DEU40", d: "DAX" },
            { s: "FOREXCOM:UKXGBP", d: "FTSE 100" },
            { s: "INDEX:NKY", d: "Nikkei 225" },
          ],
        },
        {
          title: t("dashboard.commoditiesTab"),
          originalTitle: "Futures",
          symbols: [
            { s: "TVC:GOLD", d: t("dashboard.benchGold") },
            { s: "TVC:SILVER", d: t("dashboard.benchSilver") },
            { s: "TVC:USOIL", d: t("dashboard.benchOil") },
            { s: "TVC:UKOIL", d: t("dashboard.benchBrent") },
          ],
        },
      ],
    }),
    [colorTheme, t, widgetLocale],
  );

  const chartConfig = useMemo(
    () => ({
      autosize: true,
      symbol: "AMEX:SPY",
      interval: "D",
      timezone: "Etc/UTC",
      theme: colorTheme,
      style: "1",
      locale: widgetLocale,
      allow_symbol_change: false,
      calendar: false,
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      hide_volume: false,
      withdateranges: true,
      support_host: "https://www.tradingview.com",
    }),
    [colorTheme, widgetLocale],
  );

  const heatmapConfig = useMemo(
    () => ({
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: widgetLocale,
      symbolUrl: "",
      colorTheme,
      hasTopBar: true,
      isDataSetEnabled: false,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: HEATMAP_H - WIDGET_CHROME,
    }),
    [colorTheme, widgetLocale],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(26rem,0.95fr)_minmax(0,1.25fr)]">
        <section
          aria-label={t("dashboard.overviewAria")}
          className="overflow-hidden rounded-lg border border-border"
        >
          <TradingViewEmbed
            scriptSrc={OVERVIEW_SCRIPT}
            config={overviewConfig}
            height={PANEL_H}
            className={colorTheme === "light" ? "bg-white" : "bg-[#131722]"}
          />
        </section>
        <section
          aria-label={t("dashboard.chartAria")}
          className="overflow-hidden rounded-lg border border-border"
        >
          <TradingViewEmbed
            scriptSrc={CHART_SCRIPT}
            config={chartConfig}
            height={PANEL_H}
            className={colorTheme === "light" ? "bg-white" : "bg-[#131722]"}
          />
        </section>
      </div>

      <section
        aria-label={t("dashboard.heatmapAria")}
        className="overflow-hidden rounded-lg border border-border"
      >
        <TradingViewEmbed
          scriptSrc={HEATMAP_SCRIPT}
          config={heatmapConfig}
          height={HEATMAP_H}
          className={colorTheme === "light" ? "bg-white" : "bg-[#131722]"}
        />
      </section>
    </div>
  );
}
