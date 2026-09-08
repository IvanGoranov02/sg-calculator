/**
 * GuruFocus-style two-stage discounted earnings (or FCF / dividend) model.
 *
 * Intrinsic = E(0)·x·(1−xⁿ)/(1−x) + E(0)·xⁿ·y·(1−yᵐ)/(1−y)
 * where x = (1+g₁)/(1+d), y = (1+g₂)/(1+d).
 * Fair value per share = intrinsic + optional tangible book value per share.
 */

export type DcfBaseMetric = "eps" | "fcf" | "dividend";

export type GuruFocusDcfInputs = {
  /** Current per-share base (EPS w/o NRI, FCF/share, or dividend/share). */
  basePerShare: number;
  /** Discount rate (decimal, e.g. 0.11). */
  discountRate: number;
  /** Growth-stage years (n). */
  growthYears: number;
  /** Growth-stage annual rate (g₁, decimal). */
  growthRate: number;
  /** Terminal-stage years (m). */
  terminalYears: number;
  /** Terminal-stage annual rate (g₂, decimal). */
  terminalGrowthRate: number;
  /** Optional tangible book value per share added to fair value. */
  tangibleBookPerShare?: number;
};

export type GuruFocusDcfYearPoint = {
  year: number;
  projected: number;
  presentValue: number;
  cumulativePv: number;
  stage: "growth" | "terminal";
};

export type GuruFocusDcfResult = {
  growthValue: number;
  terminalValue: number;
  intrinsicValue: number;
  tangibleBookPerShare: number;
  fairValuePerShare: number;
  yearlyProjections: GuruFocusDcfYearPoint[];
};

function geometricSeriesSum(x: number, n: number): number {
  if (n <= 0) return 0;
  if (Math.abs(x - 1) < 1e-9) return n;
  return (x * (1 - x ** n)) / (1 - x);
}

/** GuruFocus growth-stage PV factor: x·(1−xⁿ)/(1−x). */
export function growthStageFactor(x: number, n: number): number {
  return geometricSeriesSum(x, n);
}

/** GuruFocus terminal-stage PV factor: xⁿ·y·(1−yᵐ)/(1−y). */
export function terminalStageFactor(x: number, y: number, n: number, m: number): number {
  if (m <= 0) return 0;
  return x ** n * geometricSeriesSum(y, m);
}

export function buildGuruFocusYearlyProjections(
  input: GuruFocusDcfInputs,
): GuruFocusDcfYearPoint[] {
  const d = input.discountRate;
  const g1 = input.growthRate;
  const g2 = input.terminalGrowthRate;
  const n = Math.max(0, Math.floor(input.growthYears));
  const m = Math.max(0, Math.floor(input.terminalYears));
  const e0 = input.basePerShare;
  const totalYears = n + m;

  const points: GuruFocusDcfYearPoint[] = [];
  let cumulative = 0;
  let earnings = e0;

  for (let t = 1; t <= totalYears; t++) {
    if (t <= n) {
      earnings = e0 * (1 + g1) ** t;
    } else {
      const eAtN = e0 * (1 + g1) ** n;
      earnings = eAtN * (1 + g2) ** (t - n);
    }
    const pv = earnings / (1 + d) ** t;
    cumulative += pv;
    points.push({
      year: t,
      projected: earnings,
      presentValue: pv,
      cumulativePv: cumulative,
      stage: t <= n ? "growth" : "terminal",
    });
  }

  return points;
}

export function computeGuruFocusDcf(input: GuruFocusDcfInputs): GuruFocusDcfResult {
  const d = input.discountRate;
  const g1 = input.growthRate;
  const g2 = input.terminalGrowthRate;
  const n = Math.floor(input.growthYears);
  const m = Math.floor(input.terminalYears);

  if (!Number.isFinite(input.basePerShare) || input.basePerShare <= 0) {
    throw new Error("Base per-share value must be positive.");
  }
  if (d <= 0 || d >= 1) {
    throw new Error("Discount rate must be between 0 and 1 (exclusive).");
  }
  if (g2 < 0 || g2 >= d) {
    throw new Error("Terminal growth must be non-negative and strictly below discount rate.");
  }
  if (n < 0 || m < 0) {
    throw new Error("Stage years must be non-negative.");
  }

  const x = (1 + g1) / (1 + d);
  const y = (1 + g2) / (1 + d);
  const e0 = input.basePerShare;

  const growthFactor = growthStageFactor(x, n);
  const terminalFactor = terminalStageFactor(x, y, n, m);
  const growthValue = e0 * growthFactor;
  const terminalValue = e0 * terminalFactor;
  const intrinsicValue = growthValue + terminalValue;
  const tangibleBookPerShare = Math.max(0, input.tangibleBookPerShare ?? 0);
  const fairValuePerShare = intrinsicValue + tangibleBookPerShare;

  return {
    growthValue,
    terminalValue,
    intrinsicValue,
    tangibleBookPerShare,
    fairValuePerShare,
    yearlyProjections: buildGuruFocusYearlyProjections(input),
  };
}

/** Margin of safety: (fair value − price) / fair value. */
export function marginOfSafetyPct(fairValue: number, price: number): number | null {
  if (!Number.isFinite(fairValue) || fairValue <= 0 || !Number.isFinite(price) || price <= 0) {
    return null;
  }
  return ((fairValue - price) / fairValue) * 100;
}

/** Cap GuruFocus-style historical growth between 5% and 20%. */
export function capGuruFocusGrowthRate(rate: number): number {
  return Math.min(0.2, Math.max(0.05, rate));
}

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
