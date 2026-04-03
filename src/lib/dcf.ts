/**
 * Simple 5-year FCF DCF + terminal multiple (common retail / spreadsheet style).
 * EV = PV(FCF yrs 1–5) + PV(terminal); equity = EV − net debt; per share = equity / shares.
 * FCF = free cash flow (Yahoo: operating cash flow − capex); used as cash available to investors.
 */

export type SimpleDcfInputs = {
  /** Starting FCF (USD), before year-1 growth. */
  baseFcf: number;
  /** Annual growth applied each of years 1–5. */
  growthYears1To5: number;
  /** Discount rate (e.g. required return), 0–1. */
  discountRate: number;
  /** Terminal value = FCF at year 5 × multiple. */
  terminalMultiple: number;
  netDebt: number;
  sharesOutstanding: number;
};

export type SimpleDcfResult = {
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  pvProjectedFcf: number;
  pvTerminal: number;
  fcfYear5: number;
  terminalValue: number;
};

export function computeSimpleDcf(input: SimpleDcfInputs): SimpleDcfResult {
  const r = input.discountRate;
  if (r <= 0 || r >= 1) {
    throw new Error("Discount rate must be between 0 and 1 (exclusive).");
  }
  if (input.terminalMultiple <= 0) {
    throw new Error("Terminal multiple must be positive.");
  }

  let fcf = input.baseFcf;
  let pvProjectedFcf = 0;

  for (let t = 1; t <= 5; t++) {
    fcf *= 1 + input.growthYears1To5;
    pvProjectedFcf += fcf / (1 + r) ** t;
  }

  const fcfYear5 = fcf;
  const terminalValue = fcfYear5 * input.terminalMultiple;
  const pvTerminal = terminalValue / (1 + r) ** 5;
  const enterpriseValue = pvProjectedFcf + pvTerminal;
  const equityValue = Math.max(0, enterpriseValue - (input.netDebt || 0));
  const fairValuePerShare =
    input.sharesOutstanding > 0 ? equityValue / input.sharesOutstanding : 0;

  return {
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    pvProjectedFcf,
    pvTerminal,
    fcfYear5,
    terminalValue,
  };
}

/** 10-year explicit FCFF forecast, then Gordon growth terminal (matches DcfCalculator). */
export type DcfInputs = {
  baseFcf: number;
  growthYears1To5: number;
  growthYears6To10: number;
  wacc: number;
  terminalGrowthRate: number;
  netDebt: number;
  sharesOutstanding: number;
};

export type DcfResult = {
  enterpriseValue: number;
  equityValue: number;
  fairValuePerShare: number;
  pvProjectedFcf: number;
  pvTerminal: number;
  fcfYear10: number;
  fcfYear11: number;
  terminalValue: number;
};

/**
 * FCFF grows at g1 for years 1–5 and g2 for years 6–10 (compounded on prior year).
 * Terminal: FCF_11 = FCF_10×(1+g), TV = FCF_11/(WACC−g), PV at t=10.
 */
export function computeDcf(input: DcfInputs): DcfResult {
  const wacc = input.wacc;
  const g = input.terminalGrowthRate;
  if (wacc <= 0 || wacc >= 1) {
    throw new Error("WACC must be between 0 and 1 (exclusive).");
  }
  if (g < 0 || g >= wacc) {
    throw new Error("Terminal growth must be non-negative and strictly below WACC.");
  }

  let fcf = input.baseFcf;
  let pvProjectedFcf = 0;

  for (let t = 1; t <= 5; t++) {
    fcf *= 1 + input.growthYears1To5;
    pvProjectedFcf += fcf / (1 + wacc) ** t;
  }
  for (let t = 6; t <= 10; t++) {
    fcf *= 1 + input.growthYears6To10;
    pvProjectedFcf += fcf / (1 + wacc) ** t;
  }

  const fcfYear10 = fcf;
  const fcfYear11 = fcfYear10 * (1 + g);
  const terminalValue = fcfYear11 / (wacc - g);
  const pvTerminal = terminalValue / (1 + wacc) ** 10;
  const enterpriseValue = pvProjectedFcf + pvTerminal;
  const equityValue = Math.max(0, enterpriseValue - (input.netDebt || 0));
  const fairValuePerShare =
    input.sharesOutstanding > 0 ? equityValue / input.sharesOutstanding : 0;

  return {
    enterpriseValue,
    equityValue,
    fairValuePerShare,
    pvProjectedFcf,
    pvTerminal,
    fcfYear10,
    fcfYear11,
    terminalValue,
  };
}
