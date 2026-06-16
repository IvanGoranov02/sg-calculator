/**
 * Valuation verdict: synthesize a fair-value estimate for a stock from three
 * independent angles — a 10-year DCF, a multiples model (EPS × the company's own
 * historical average P/E), and a reverse DCF (the FCF growth the current price
 * implies). Pure + deterministic so it can be unit-tested and run client-side.
 */

import { computeDcf, type DcfInputs } from "@/lib/dcf";

export type ValuationInputs = {
  price: number;
  /** Latest annual free cash flow. */
  baseFcf: number;
  netDebt: number;
  sharesOutstanding: number;
  trailingEps: number | null;
  /** Company's own historical average trailing P/E, when derivable. */
  avgHistoricalPe: number | null;
  /** Stage-1 (yrs 1–5) annual FCF growth, decimal. Stage 2 tapers to half. */
  growthRate: number;
  wacc: number;
  terminalGrowth: number;
};

export type ValuationMethod = {
  key: "dcf" | "multiples";
  fairValue: number | null;
};

export type Verdict = "undervalued" | "fair" | "overvalued" | "unknown";

export type ValuationVerdictResult = {
  methods: ValuationMethod[];
  fairValueLow: number | null;
  fairValueMid: number | null;
  fairValueHigh: number | null;
  /** (mid − price) / price × 100; positive = trades below estimate (a discount). */
  discountPct: number | null;
  verdict: Verdict;
  /** Reverse DCF: stage-1 growth % the current price implies, or null. */
  impliedGrowthPct: number | null;
};

/** Sensible bounds so a single noisy input can't produce an absurd estimate. */
const PE_MIN = 5;
const PE_MAX = 45;
const UNDERVALUED_AT = 15; // % discount of mid vs price
const OVERVALUED_AT = -15;

function dcfFairValue(input: ValuationInputs): number | null {
  if (!(input.baseFcf > 0) || !(input.sharesOutstanding > 0)) return null;
  const dcf: DcfInputs = {
    baseFcf: input.baseFcf,
    growthYears1To5: input.growthRate,
    growthYears6To10: input.growthRate / 2,
    wacc: input.wacc,
    terminalGrowthRate: input.terminalGrowth,
    netDebt: input.netDebt,
    sharesOutstanding: input.sharesOutstanding,
  };
  try {
    const v = computeDcf(dcf).fairValuePerShare;
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function multiplesFairValue(input: ValuationInputs): number | null {
  const eps = input.trailingEps;
  const pe = input.avgHistoricalPe;
  if (eps == null || !Number.isFinite(eps) || eps <= 0) return null;
  if (pe == null || !Number.isFinite(pe) || pe <= 0) return null;
  const clampedPe = Math.max(PE_MIN, Math.min(PE_MAX, pe));
  return eps * clampedPe;
}

/** Reverse DCF: binary-search the stage-1 growth that makes the DCF match the price. */
function impliedGrowth(input: ValuationInputs): number | null {
  if (!(input.baseFcf > 0) || !(input.sharesOutstanding > 0) || !(input.price > 0)) return null;
  const valueAt = (g: number): number | null => {
    try {
      const v = computeDcf({
        baseFcf: input.baseFcf,
        growthYears1To5: g,
        growthYears6To10: g / 2,
        wacc: input.wacc,
        terminalGrowthRate: input.terminalGrowth,
        netDebt: input.netDebt,
        sharesOutstanding: input.sharesOutstanding,
      }).fairValuePerShare;
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  };

  let lo = -0.2;
  let hi = 0.6;
  const vLo = valueAt(lo);
  const vHi = valueAt(hi);
  if (vLo == null || vHi == null) return null;
  // Price outside the achievable band → report the boundary rather than a wrong number.
  if (input.price <= vLo) return lo * 100;
  if (input.price >= vHi) return hi * 100;

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const v = valueAt(mid);
    if (v == null) return null;
    if (v < input.price) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * 100;
}

export function computeValuationVerdict(input: ValuationInputs): ValuationVerdictResult {
  const dcf = dcfFairValue(input);
  const multiples = multiplesFairValue(input);
  const methods: ValuationMethod[] = [
    { key: "dcf", fairValue: dcf },
    { key: "multiples", fairValue: multiples },
  ];

  const present = [dcf, multiples].filter((v): v is number => v != null && v > 0);
  if (present.length === 0 || !(input.price > 0)) {
    return {
      methods,
      fairValueLow: null,
      fairValueMid: null,
      fairValueHigh: null,
      discountPct: null,
      verdict: "unknown",
      impliedGrowthPct: impliedGrowth(input),
    };
  }

  const low = Math.min(...present);
  const high = Math.max(...present);
  const mid = present.reduce((a, b) => a + b, 0) / present.length;
  const discountPct = ((mid - input.price) / input.price) * 100;
  const verdict: Verdict =
    discountPct >= UNDERVALUED_AT ? "undervalued" : discountPct <= OVERVALUED_AT ? "overvalued" : "fair";

  return {
    methods,
    fairValueLow: low,
    fairValueMid: mid,
    fairValueHigh: high,
    discountPct,
    verdict,
    impliedGrowthPct: impliedGrowth(input),
  };
}
