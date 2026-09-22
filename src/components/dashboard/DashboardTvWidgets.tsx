"use client";

import { useMemo } from "react";

import { TradingViewEmbed } from "@/components/dashboard/TradingViewEmbed";
import { useI18n } from "@/lib/i18n/LocaleProvider";
import { usePreferences } from "@/lib/preferences/PreferencesProvider";

const OVERVIEW_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";
const CHART_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
const HEATMAP_SCRIPT = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";

const PANEL_H = 620;
const HEATMAP_H = 460;

export function DashboardTvWidgets() {
  const { t } = useI18n();
  const { theme } = usePreferences();
  const colorTheme = theme === "light" ? "light" : "dark";

  const overviewConfig = useMemo(
    () => ({
      colorTheme,
      dateRange: "12M",
      showChart: true,
      locale: "en",
      largeChartUrl: "",
      isTransparent: false,
      showSymbolLogo: true,
      showFloatingTooltip: true,
      width: "100%",
      height: "100%",
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
          symbols: [
            { s: "COMEX:GC1!", d: t("dashboard.benchGold") },
            { s: "COMEX:SI1!", d: t("dashboard.benchSilver") },
            { s: "NYMEX:CL1!", d: t("dashboard.benchOil") },
            { s: "NYMEX:BZ1!", d: t("dashboard.benchBrent") },
          ],
        },
      ],
    }),
    [colorTheme, t],
  );

  const chartConfig = useMemo(
    () => ({
      autosize: true,
      symbol: "AMEX:SPY",
      interval: "D",
      timezone: "Etc/UTC",
      theme: colorTheme,
      style: "1",
      locale: "en",
      allow_symbol_change: true,
      calendar: false,
      hide_side_toolbar: true,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      hide_volume: false,
      withdateranges: true,
      support_host: "https://www.tradingview.com",
    }),
    [colorTheme],
  );

  const heatmapConfig = useMemo(
    () => ({
      exchanges: [],
      dataSource: "SPX500",
      grouping: "sector",
      blockSize: "market_cap_basic",
      blockColor: "change",
      locale: "en",
      symbolUrl: "",
      colorTheme,
      hasTopBar: true,
      isDataSetEnabled: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      isMonoSize: false,
      width: "100%",
      height: "100%",
    }),
    [colorTheme],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(22rem,0.92fr)_minmax(0,1.35fr)]">
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
