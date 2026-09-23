/**
 * Qualtrim-style EPS model: grow TTM EPS, apply a P/E multiple at a horizon,
 * then derive annualized return vs today's price and entry price for a target return.
 */

export const EPS_MODEL_HORIZON_YEARS = 5;

/** Editable default when trailing P/E cannot be derived from price and EPS. */
export const DEFAULT_PE_MULTIPLE = 20;

/** Soft bounds for typed P/E — seed values outside this range are kept as-is. */
export const PE_MULTIPLE_SANITY_MIN = 0.1;
export const PE_MULTIPLE_SANITY_MAX = 500;

export type EpsModelInputs = {
  ttmEps: number;
  /** Annual EPS growth (decimal, e.g. 0.18). */
  growthRate: number;
  peMultiple: number;
  currentPrice: number;
  /** Required annual return (decimal, e.g. 0.15). */
  desiredReturn: number;
  horizonYears?: number;
};

export type EpsModelChartPoint = {
  yearIndex: number;
  projectedPrice: number;
  projectedEps: number;
};

export type EpsModelResult = {
  horizonYears: number;
  targetPrice: number;
  /** CAGR from current price to target price over the horizon; null without a positive price. */
  annualizedReturnFromPrice: number | null;
  entryPriceForDesiredReturn: number | null;
  chartPoints: EpsModelChartPoint[];
};

export type EpsModelValidationError =
  | "eps_non_positive"
  | "growth_rate_invalid"
  | "pe_non_positive"
  | "pe_out_of_range"
  | "desired_return_invalid"
  | "horizon_invalid";

export function projectedEpsAtYear(ttmEps: number, growthRate: number, year: number): number {
  return ttmEps * (1 + growthRate) ** year;
}

export function targetPriceFromEpsModel(
  ttmEps: number,
  growthRate: number,
  peMultiple: number,
  horizonYears: number,
): number {
  return projectedEpsAtYear(ttmEps, growthRate, horizonYears) * peMultiple;
}

export function annualizedReturnBetweenPrices(
  fromPrice: number,
  toPrice: number,
  years: number,
): number | null {
  if (!Number.isFinite(fromPrice) || fromPrice <= 0) return null;
  if (!Number.isFinite(toPrice) || toPrice <= 0) return null;
  if (!Number.isFinite(years) || years <= 0) return null;
  const rate = (toPrice / fromPrice) ** (1 / years) - 1;
  return Number.isFinite(rate) ? rate : null;
}

export function entryPriceForTargetReturn(
  targetPrice: number,
  desiredReturn: number,
  years: number,
): number | null {
  if (!Number.isFinite(targetPrice) || targetPrice <= 0) return null;
  if (!Number.isFinite(desiredReturn) || desiredReturn <= 0) return null;
  if (!Number.isFinite(years) || years <= 0) return null;
  const entry = targetPrice / (1 + desiredReturn) ** years;
  return Number.isFinite(entry) && entry > 0 ? entry : null;
}

/** Trailing P/E from quote and TTM EPS (not clamped). */
export function trailingPeFromPriceAndEps(currentPrice: number, ttmEps: number): number | null {
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return null;
  if (!Number.isFinite(ttmEps) || ttmEps <= 0) return null;
  const raw = currentPrice / ttmEps;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return Math.round(raw * 10) / 10;
}

/** Seed P/E for the calculator: real trailing multiple or a neutral default. */
export function seedPeMultiple(currentPrice: number, ttmEps: number): number {
  return trailingPeFromPriceAndEps(currentPrice, ttmEps) ?? DEFAULT_PE_MULTIPLE;
}

export function validateEpsModelInputs(params: {
  ttmEps: number;
  growthRatePct: number;
  peMultiple: number;
  desiredReturnPct: number;
  horizonYears: number;
}): EpsModelValidationError | null {
  const { ttmEps, growthRatePct, peMultiple, desiredReturnPct, horizonYears } = params;

  if (!Number.isFinite(ttmEps) || ttmEps <= 0) return "eps_non_positive";

  if (!Number.isFinite(growthRatePct) || growthRatePct <= -100) {
    return "growth_rate_invalid";
  }

  if (!Number.isFinite(peMultiple) || peMultiple <= 0) return "pe_non_positive";
  if (peMultiple < PE_MULTIPLE_SANITY_MIN || peMultiple > PE_MULTIPLE_SANITY_MAX) {
    return "pe_out_of_range";
  }

  if (!Number.isFinite(desiredReturnPct) || desiredReturnPct <= 0 || desiredReturnPct >= 100) {
    return "desired_return_invalid";
  }

  if (!Number.isFinite(horizonYears) || horizonYears <= 0 || horizonYears > 30) {
    return "horizon_invalid";
  }

  return null;
}

export function epsModelChartLabel(
  yearIndex: number,
  options?: { now?: Date; todayLabel?: string },
): string {
  const now = options?.now ?? new Date();
  const todayLabel = options?.todayLabel ?? "Today";
  if (yearIndex === 0) return todayLabel;
  return `Q1 ${now.getFullYear() + yearIndex}`;
}

export function computeEpsModel(input: EpsModelInputs): EpsModelResult {
  const horizonYears = Math.max(1, Math.floor(input.horizonYears ?? EPS_MODEL_HORIZON_YEARS));
  const growthRate = input.growthRate;
  const peMultiple = input.peMultiple;

  if (!Number.isFinite(growthRate) || growthRate <= -1) {
    throw new Error("Growth rate must be finite and greater than -100%.");
  }
  if (!Number.isFinite(peMultiple) || peMultiple <= 0) {
    throw new Error("P/E multiple must be positive.");
  }

  const targetPrice = targetPriceFromEpsModel(
    input.ttmEps,
    growthRate,
    peMultiple,
    horizonYears,
  );

  if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
    throw new Error("Target price is not computable with the current inputs.");
  }

  const annualizedReturnFromPrice = annualizedReturnBetweenPrices(
    input.currentPrice,
    targetPrice,
    horizonYears,
  );

  const entryPriceForDesiredReturn = entryPriceForTargetReturn(
    targetPrice,
    input.desiredReturn,
    horizonYears,
  );

  const chartPoints: EpsModelChartPoint[] = [];
  for (let i = 0; i <= horizonYears; i++) {
    const epsAtYear = projectedEpsAtYear(input.ttmEps, growthRate, i);
    let projectedPrice: number;
    if (i === 0 && input.currentPrice > 0) {
      projectedPrice = input.currentPrice;
    } else if (annualizedReturnFromPrice != null && input.currentPrice > 0) {
      projectedPrice = input.currentPrice * (1 + annualizedReturnFromPrice) ** i;
    } else {
      projectedPrice = epsAtYear * peMultiple;
    }
    chartPoints.push({
      yearIndex: i,
      projectedPrice,
      projectedEps: epsAtYear,
    });
  }

  return {
    horizonYears,
    targetPrice,
    annualizedReturnFromPrice,
    entryPriceForDesiredReturn,
    chartPoints,
  };
}
