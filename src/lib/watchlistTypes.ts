export type WatchlistQuoteRow = {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changesPercentage: number;
  /** 200-day moving average from Yahoo quote when available. */
  twoHundredDayAverage: number | null;
  /** (price - sma200) / sma200 * 100; null if SMA missing. */
  dipVsSma200Pct: number | null;
};
