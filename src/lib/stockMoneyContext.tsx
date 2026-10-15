"use client";

import { createContext, useContext, type ReactNode } from "react";

const StockMoneyCurrencyContext = createContext("USD");
export function StockMoneyCurrencyProvider({ currency, children }: { currency: string; children: ReactNode }) {
  return <StockMoneyCurrencyContext.Provider value={currency}>{children}</StockMoneyCurrencyContext.Provider>;
}
export function useStockMoneyCurrency(): string { return useContext(StockMoneyCurrencyContext); }
