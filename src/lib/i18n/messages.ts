export type AppLocale = "en" | "bg";

export const LOCALE_STORAGE_KEY = "sg-locale-v1";

/** Nested string leaves; allows recursive groups without circular type-alias issues. */
export interface MessageDict {
  [key: string]: string | MessageDict;
}

export const messages: Record<AppLocale, MessageDict> = {
  en: {
    meta: {
      title: "StockGauge · Stock analysis",
      description: "Stock analysis, DCF, and watchlist — Yahoo Finance data.",
    },
    nav: {
      dashboard: "Dashboard",
      stockAnalysis: "Stock Analysis",
      dcfCalculator: "DCF Calculator",
      watchlist: "Watchlist",
      brand: "StockGauge",
      footer: "Data · Yahoo Finance",
    },
    header: {
      tagline: "Markets · Analysis workspace",
      language: "Language",
      english: "English",
      bulgarian: "Bulgarian",
      signIn: "Sign in",
    },
    login: {
      title: "Sign in",
      subtitle: "Account access — database and Google sign-in will be wired next.",
      email: "Email",
      password: "Password",
      submit: "Sign in",
      google: "Continue with Google",
      googleSoon: "Google sign-in will be available after setup.",
      divider: "or",
      back: "Back to app",
      placeholderEmail: "you@example.com",
      notImplemented: "Email sign-in is not connected yet. Deploy the app, then add auth and a database.",
    },
    search: {
      placeholder: "Search ticker (e.g. AAPL)",
      submit: "Search",
    },
    dashboard: {
      title: "Dashboard",
      welcome:
        "Use the search bar for any ticker, or jump to a tool below. Data from Yahoo Finance (yahoo-finance2, no API key).",
      marketTitle: "Market pulse",
      marketSpyHint: "S&P 500 ETF — broad US equities benchmark.",
      marketQqqHint: "Nasdaq-100 ETF — tech-heavy benchmark.",
      marketUnavailable: "Market quotes are unavailable right now.",
      quickStockTitle: "Stock Analysis",
      quickStockDesc: "Price history, fundamentals, and income statement by ticker.",
      quickDcfTitle: "DCF Calculator",
      quickDcfDesc: "Fundamentals over time, simple DCF, fair value vs market.",
      quickWlTitle: "Watchlist",
      quickWlDesc: "Save symbols locally, refresh quotes, open analysis in one click.",
      watchlistTitle: "Watchlist snapshot",
      watchlistDesc: "Symbols saved in this browser. Add or edit them on the Watchlist page.",
      watchlistEmptyBefore: "No symbols yet.",
      watchlistEmptyLink: "Open Watchlist",
      watchlistEmptyAfter: "to add tickers, or use Search above.",
      watchlistRefresh: "Refresh",
      watchlistManage: "Manage watchlist",
      watchlistLoading: "Loading quotes…",
      watchlistError: "Could not load watchlist quotes.",
      colSymbol: "Symbol",
      colPrice: "Price",
      colChange: "Change",
      colActions: "Actions",
      actionAnalysis: "Analysis",
      actionDcf: "DCF",
      quotesUpdated: "Quotes updated: {time}",
      marketAria: "Market benchmarks",
      watchlistSnapshotAria: "Watchlist snapshot with live quotes",
    },
    stock: {
      couldNotLoad: "Could not load {symbol}",
      noData: "No data",
      searchValid: "Search for a valid ticker symbol.",
      subtitle: "Stock analysis · Yahoo Finance (via yahoo-finance2)",
    },
    income: {
      title: "Income statement",
      subtitle: "Annual figures (USD) · last 5 years (Yahoo Finance).",
      metricCol: "Metric",
      revenue: "Revenue",
      grossProfit: "Gross profit",
      operatingExpenses: "Operating expenses",
      netIncome: "Net income",
    },
    chart: {
      performance: "Performance",
      performanceDesc:
        "Toggle metrics and time range. Price uses Yahoo daily history (1D uses 5m intraday when available). Revenue and cash flows use fiscal years — shorter ranges show fewer FY columns.",
      metricPrice: "Price",
      metricRevenue: "Revenue",
      metricNetIncome: "Net income",
      metricFcf: "Free cash flow",
      range: "Range",
      rangeTitle1d: "1 day (intraday when available)",
      rangeTitle1w: "1 week",
      rangeTitle1m: "1 month",
      rangeTitle1y: "1 year",
      rangeTitle5y: "5 years",
      rangeTitleMax: "Maximum history",
      periodChange: "Period change",
      rangeHigh: "Range high",
      rangeLow: "Range low",
      volumeSum: "Volume (sum)",
      lastValue: "Last value",
      fyYear: "FY {y}",
    },
    watchlist: {
      title: "Watchlist",
      intro: "Saved locally in this browser (up to {max} symbols). Quotes refresh from Yahoo Finance.",
      addLabel: "Add symbol",
      placeholder: "e.g. NVDA",
      addButton: "Add to watchlist",
      refresh: "Refresh",
      errRefresh: "Could not refresh quotes.",
      errNetwork: "Network error while loading quotes.",
      emptyTitle: "Empty watchlist",
      emptyDescBefore: 'Add tickers above, or open ',
      emptyLink: "Stock Analysis",
      emptyDescAfter: ' and use "Watchlist" on a loaded symbol.',
      yourSymbols: "Your symbols",
      savedLine: "{count} saved",
      delayedInvalid: " · {n} delayed or invalid",
      allQuoted: " · all quoted",
      colSymbol: "Symbol",
      colName: "Name",
      colPrice: "Price",
      colChange: "Change",
      loading: "Loading…",
      quoteUnavailable: "Quote unavailable",
      analyze: "Analyze",
      removeAria: "Remove {symbol}",
      toggle: "Watchlist",
      saved: "Saved",
      fullTitle: "Watchlist full ({max} max)",
    },
    dcf: {
      title: "DCF Calculator",
      intro:
        "Simplified model: 5-year growth of free cash flow (FCF), discounted at one rate, terminal multiple on year-5 FCF — typical spreadsheet style. FCF here is the standard Yahoo line (operating cash flow minus capex), not a separate “FCFF” label.",
      seedLine: "{symbol} · {name} · market {price}",
      noSeed: "No data for {ticker}. Enter manually or pick another ticker.",
      snapshotTitle: "Financial snapshot (latest year)",
      snapshotDesc: "Reported figures for context. You set growth and FCF for valuation in the next section.",
      snapRevenue: "Revenue",
      snapOpMargin: "Operating margin",
      snapOpMarginSub: "operating income / revenue",
      snapNetIncome: "Net income",
      snapEbitda: "EBITDA",
      snapFcf: "Free cash flow",
      snapFcfSub: "Yahoo annual free cash flow",
      assumptionsTitle: "DCF assumptions",
      assumptionsDesc: "Enter percents as numbers: 10 = 10%.",
      baseFcf: "Starting FCF (USD)",
      baseFcfHint:
        "Forecast base; defaults from Yahoo when available. This is the standard FCF line, not a custom abbreviation.",
      growth: "Annual FCF growth (years 1–5) %",
      discount: "Discount / required return %",
      discountHint: "Single rate to discount future cash flows.",
      terminal: "Terminal multiple (× FCF year 5)",
      terminalHint: "Value at end of year 5 = FCF₅ × multiple.",
      netDebt: "Net debt (USD)",
      netDebtHint: "Subtracted from enterprise value for equity holders.",
      shares: "Shares outstanding",
      resultTitle: "Result",
      resultDisclaimer: "Illustrative only; not investment advice.",
      needInputs: "Enter positive FCF, shares, and a terminal multiple.",
      ev: "Enterprise value (EV)",
      equity: "Equity (after net debt)",
      fairValue: "Fair value per share",
      vsMarket: "vs market {price}:",
      vsMarketPct: "{pct}% vs price",
      detailPv: "Detail · PV",
      pvFcf: "PV of FCF (yrs 1–5): {v}",
      fcfY5: "FCF at end of year 5: {v}",
      terminalUndisc: "Terminal (undiscounted): {v}",
      pvTerminal: "PV of terminal: {v}",
    },
    loading: {
      stock: "Loading data…",
      dcf: "Loading DCF inputs…",
    },
    errors: {
      emptyTicker: "Empty ticker.",
      tickerNotFound: 'Ticker "{sym}" was not found. Use a Yahoo symbol (e.g. NVDA for NVIDIA).',
      tickerNotFoundShort: 'Ticker "{sym}" was not found.',
      noIncome: 'No annual income statement data for "{sym}".',
      loadFailed: "Could not load stock data.",
    },
  },
  bg: {
    meta: {
      title: "StockGauge · Анализ на акции",
      description: "Анализ на акции, DCF и списък за наблюдение — данни от Yahoo Finance.",
    },
    nav: {
      dashboard: "Табло",
      stockAnalysis: "Анализ на акции",
      dcfCalculator: "DCF калкулатор",
      watchlist: "Списък",
      brand: "StockGauge",
      footer: "Данни · Yahoo Finance",
    },
    header: {
      tagline: "Пазари · Работно пространство",
      language: "Език",
      english: "Английски",
      bulgarian: "Български",
      signIn: "Вход",
    },
    login: {
      title: "Вход",
      subtitle: "Достъп до акаунт — база данни и вход с Google ще се свържат следващо.",
      email: "Имейл",
      password: "Парола",
      submit: "Вход",
      google: "Продължи с Google",
      googleSoon: "Вход с Google ще е наличен след настройка.",
      divider: "или",
      back: "Към приложението",
      placeholderEmail: "you@example.com",
      notImplemented:
        "Вход с имейл още не е свързан. Деплой на приложението, после auth и база данни.",
    },
    search: {
      placeholder: "Тикер (напр. AAPL)",
      submit: "Търси",
    },
    dashboard: {
      title: "Табло",
      welcome:
        "Ползвайте търсенето за тикер или преминете към инструмент по-долу. Данни от Yahoo Finance (yahoo-finance2, без API ключ).",
      marketTitle: "Пазарен пулс",
      marketSpyHint: "ETF на S&P 500 — широк US пазарен ориентир.",
      marketQqqHint: "ETF Nasdaq-100 — технологичен ориентир.",
      marketUnavailable: "Котировките за пазара не са налични в момента.",
      quickStockTitle: "Анализ на акции",
      quickStockDesc: "История на цената, фундаменти и отчет за приходите по тикер.",
      quickDcfTitle: "DCF калкулатор",
      quickDcfDesc: "Фундаменти във времете, опростен DCF, справедлива стойност спрямо пазара.",
      quickWlTitle: "Списък за наблюдение",
      quickWlDesc: "Запазване локално, опресняване на котировки, бърз анализ.",
      watchlistTitle: "Списък — снимка",
      watchlistDesc: "Символи, запазени в този браузър. Редакция от страницата Списък.",
      watchlistEmptyBefore: "Все още няма символи.",
      watchlistEmptyLink: "Отвори списъка",
      watchlistEmptyAfter: "за добавяне на тикери или ползвайте търсенето по-горе.",
      watchlistRefresh: "Опресни",
      watchlistManage: "Управление на списъка",
      watchlistLoading: "Зареждане на котировки…",
      watchlistError: "Неуспешно зареждане на котировки за списъка.",
      colSymbol: "Символ",
      colPrice: "Цена",
      colChange: "Промяна",
      colActions: "Действия",
      actionAnalysis: "Анализ",
      actionDcf: "DCF",
      quotesUpdated: "Котировки опреснени: {time}",
      marketAria: "Пазарни бенчмаркове",
      watchlistSnapshotAria: "Снимка на списъка с котировки",
    },
    stock: {
      couldNotLoad: "Неуспешно зареждане на {symbol}",
      noData: "Няма данни",
      searchValid: "Въведете валиден тикер.",
      subtitle: "Анализ на акции · Yahoo Finance (yahoo-finance2)",
    },
    income: {
      title: "Отчет за приходите",
      subtitle: "Годишни стойности (USD) · последни 5 години (Yahoo Finance).",
      metricCol: "Показател",
      revenue: "Приходи",
      grossProfit: "Брутна печалба",
      operatingExpenses: "Оперативни разходи",
      netIncome: "Нетна печалба",
    },
    chart: {
      performance: "Представяне",
      performanceDesc:
        "Превключвайте показатели и период. Цената ползва дневна история от Yahoo (1D — 5m интрадей при наличност). Приходите и паричните потоци са по фискални години — по-късите периоди показват по-малко колони.",
      metricPrice: "Цена",
      metricRevenue: "Приходи",
      metricNetIncome: "Нетна печалба",
      metricFcf: "Свободен паричен поток",
      range: "Период",
      rangeTitle1d: "1 ден (интрадей при наличност)",
      rangeTitle1w: "1 седмица",
      rangeTitle1m: "1 месец",
      rangeTitle1y: "1 година",
      rangeTitle5y: "5 години",
      rangeTitleMax: "Максимална история",
      periodChange: "Промяна за периода",
      rangeHigh: "Макс. в периода",
      rangeLow: "Мин. в периода",
      volumeSum: "Обем (сума)",
      lastValue: "Последна стойност",
      fyYear: "ФГ {y}",
    },
    watchlist: {
      title: "Списък за наблюдение",
      intro: "Запазено локално в този браузър (до {max} символа). Котировки от Yahoo Finance.",
      addLabel: "Добави символ",
      placeholder: "напр. NVDA",
      addButton: "Добави в списъка",
      refresh: "Опресни",
      errRefresh: "Неуспешно опресняване на котировки.",
      errNetwork: "Мрежова грешка при зареждане.",
      emptyTitle: "Празен списък",
      emptyDescBefore: "Добавете тикери по-горе или отворете ",
      emptyLink: "Анализ на акции",
      emptyDescAfter: " и ползвайте „Списък“ при зареден символ.",
      yourSymbols: "Вашите символи",
      savedLine: "{count} запазени",
      delayedInvalid: " · {n} със закъснение или невалидни",
      allQuoted: " · всички с котировка",
      colSymbol: "Символ",
      colName: "Име",
      colPrice: "Цена",
      colChange: "Промяна",
      loading: "Зареждане…",
      quoteUnavailable: "Няма котировка",
      analyze: "Анализ",
      removeAria: "Премахни {symbol}",
      toggle: "Списък",
      saved: "Запазено",
      fullTitle: "Списъкът е пълен (макс. {max})",
    },
    dcf: {
      title: "DCF калкулатор",
      intro:
        "Опростен модел: 5-годишен ръст на свободния паричен поток (FCF), дисконтиране с една ставка, терминален мултипликатор спрямо FCF в година 5. FCF тук е стандартният ред от Yahoo (оперативен поток минус капекс).",
      seedLine: "{symbol} · {name} · пазар {price}",
      noSeed: "Няма данни за {ticker}. Въведете ръчно или изберете друг тикер.",
      snapshotTitle: "Финансова снимка (последна година)",
      snapshotDesc:
        "Отчетни числа за контекст. Ръстът и FCF за оценката настройвате в следващата секция.",
      snapRevenue: "Приходи",
      snapOpMargin: "Оперативна марж",
      snapOpMarginSub: "оперативна печалба / приходи",
      snapNetIncome: "Нетна печалба",
      snapEbitda: "EBITDA",
      snapFcf: "Свободен паричен поток (FCF)",
      snapFcfSub: "Yahoo — годишен FCF",
      assumptionsTitle: "Допускания за DCF",
      assumptionsDesc: "Процентите са като числа: 10 = 10%.",
      baseFcf: "Стартиращ FCF (USD)",
      baseFcfHint:
        "База за прогноза; по подразбиране от Yahoo. Стандартен FCF ред, не отделна абревиатура.",
      growth: "Годишен ръст на FCF (години 1–5) %",
      discount: "Дисконт / изискана доходност %",
      discountHint: "Едно число за дисконтиране на бъдещите потоци.",
      terminal: "Терминален мултипликатор (× FCF година 5)",
      terminalHint: "Стойност в края на година 5 = FCF₅ × мултипликатор.",
      netDebt: "Нетен дълг (USD)",
      netDebtHint: "Изважда се от стойността на предприятието за собствениците.",
      shares: "Брой акции",
      resultTitle: "Резултат",
      resultDisclaimer: "Илюстративно; не е инвестиционен съвет.",
      needInputs: "Въведете положителен FCF, акции и мултипликатор.",
      ev: "Стойност на предприятието (EV)",
      equity: "Собствен капитал (след нетен дълг)",
      fairValue: "Справедлива стойност на акция",
      vsMarket: "спрямо пазар {price}:",
      vsMarketPct: "{pct}% спрямо цената",
      detailPv: "Детайл · PV",
      pvFcf: "PV на FCF (год. 1–5): {v}",
      fcfY5: "FCF в края на година 5: {v}",
      terminalUndisc: "Терминал (недисконтиран): {v}",
      pvTerminal: "PV на терминал: {v}",
    },
    loading: {
      stock: "Зареждане на данни…",
      dcf: "Зареждане на DCF…",
    },
    errors: {
      emptyTicker: "Празен тикер.",
      tickerNotFound: 'Тикерът "{sym}" не е намерен. Ползвайте Yahoo символ (напр. NVDA за NVIDIA).',
      tickerNotFoundShort: 'Тикерът "{sym}" не е намерен.',
      noIncome: 'Няма годишни приходни отчети за "{sym}".',
      loadFailed: "Неуспешно зареждане на данни.",
    },
  },
};

export function getMessage(locale: AppLocale, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = messages[locale];
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

/** Replace {key} placeholders in a string. */
export function interpolate(template: string, vars: Record<string, string | number>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

type TFn = (path: string, vars?: Record<string, string | number>) => string;

/** Map Yahoo loader error strings to localized messages. */
export function translateStockError(t: TFn, message: string): string {
  const m = message.trim();
  if (m === "Empty ticker.") return t("errors.emptyTicker");
  if (m === "Could not load stock data.") return t("errors.loadFailed");
  const longForm =
    /^Ticker "([^"]+)" was not found\. Use a Yahoo symbol \(e\.g\. NVDA for NVIDIA\)\.$/.exec(m);
  if (longForm) return t("errors.tickerNotFound", { sym: longForm[1] });
  const shortForm = /^Ticker "([^"]+)" was not found\.$/.exec(m);
  if (shortForm) return t("errors.tickerNotFoundShort", { sym: shortForm[1] });
  const noInc = /^No annual income statement data for "([^"]+)"\.$/.exec(m);
  if (noInc) return t("errors.noIncome", { sym: noInc[1] });
  return message;
}
