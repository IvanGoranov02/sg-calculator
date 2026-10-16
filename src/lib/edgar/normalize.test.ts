import assert from "node:assert/strict";
import { describe, it } from "node:test";

import aaplFacts from "@/lib/edgar/__fixtures__/aapl-companyfacts.json";
import {
  buildFlowSeries,
  buildInstantSeries,
  bundleFromCompanyFacts,
  detectReportingCurrency,
  type EdgarCompanyFacts,
  type EdgarFactPoint,
} from "@/lib/edgar/normalize";

const facts = aaplFacts as unknown as EdgarCompanyFacts;

describe("bundleFromCompanyFacts: tag switches + non-annual latest filing (Uber case)", () => {
  const a = (start: string, end: string, val: number, form: string, filed: string): EdgarFactPoint => ({
    start,
    end,
    val,
    form,
    filed,
  });
  const uberLike: EdgarCompanyFacts = {
    cik: 1,
    entityName: "TagSwitch Co",
    facts: {
      "us-gaap": {
        // Preferred revenue tag is sparse (only FY2018); the company reports the
        // rest of its history under the fallback `Revenues` tag.
        RevenueFromContractWithCustomerExcludingAssessedTax: {
          units: { USD: [a("2018-01-01", "2018-12-31", 200, "10-K", "2019-02-01")] },
        },
        Revenues: {
          units: {
            USD: [
              a("2018-01-01", "2018-12-31", 999, "10-K", "2019-02-01"), // conflict — preferred wins
              a("2019-01-01", "2019-12-31", 300, "10-K", "2020-02-01"),
              a("2020-01-01", "2020-12-31", 400, "10-K", "2021-02-01"),
            ],
          },
        },
        NetIncomeLoss: {
          units: {
            USD: [
              a("2018-01-01", "2018-12-31", 20, "10-K", "2019-02-01"),
              a("2019-01-01", "2019-12-31", 30, "10-K", "2020-02-01"),
              // Latest-filed instance of FY2019 is a proxy statement (non-annual form).
              a("2019-01-01", "2019-12-31", 30, "DEFR14A", "2021-04-01"),
              a("2020-01-01", "2020-12-31", 40, "10-K", "2021-02-01"),
            ],
          },
        },
      },
    },
  };

  const b = bundleFromCompanyFacts("TS", uberLike);

  it("fills revenue history from the fallback tag where the preferred one is missing", () => {
    assert.ok(b);
    assert.equal(b?.income.find((r) => r.fiscalYear === "2019")?.revenue, 300);
    assert.equal(b?.income.find((r) => r.fiscalYear === "2020")?.revenue, 400);
  });

  it("prefers the higher-priority tag for a period both report", () => {
    assert.equal(b?.income.find((r) => r.fiscalYear === "2018")?.revenue, 200); // not 999
  });

  it("keeps a fiscal year whose latest-filed instance is a non-annual (proxy) form", () => {
    assert.equal(b?.income.find((r) => r.fiscalYear === "2019")?.netIncome, 30);
  });
});

describe("bundleFromCompanyFacts (real AAPL filing data)", () => {
  const bundle = bundleFromCompanyFacts("aapl", facts);

  it("builds a usable bundle with the entity name and uppercased symbol", () => {
    assert.ok(bundle);
    assert.equal(bundle?.quote.symbol, "AAPL");
    assert.equal(bundle?.quote.name, "Apple Inc.");
  });

  it("maps fiscal-year income as reported (FY2024 revenue = $391.035B)", () => {
    const fy24 = bundle?.income.find((r) => r.fiscalYear === "2024");
    assert.equal(fy24?.revenue, 391_035_000_000);
    assert.equal(fy24?.date, "2024-09-28");
  });

  it("derives Q4 income from FY minus the 9-month YTD chain", () => {
    const q4 = bundle?.incomeQuarterly.find((r) => r.date === "2025-09-27");
    assert.equal(q4?.revenue, 102_466_000_000);
  });

  it("derives quarterly cash flow from cumulative YTD filings", () => {
    const q4 = bundle?.cashFlowQuarterly.find((r) => r.date === "2025-09-27");
    assert.equal(q4?.operatingCashFlow, 29_728_000_000);
  });

  it("stores payments as negative outflows and FCF = OCF + capex", () => {
    const fy25 = bundle?.cashFlow.find((r) => r.fiscalYear === "2025");
    assert.equal(fy25?.capitalExpenditure, -12_715_000_000);
    assert.ok((fy25?.dividendsPaid ?? 0) < 0);
    assert.ok((fy25?.stockRepurchase ?? 0) < 0);
    assert.equal(
      fy25?.freeCashFlow,
      (fy25?.operatingCashFlow ?? 0) + (fy25?.capitalExpenditure ?? 0),
    );
  });

  it("keeps annual balance-sheet rows even when comparatives re-file in 10-Qs", () => {
    const fy25 = bundle?.balanceSheet.find((r) => r.date === "2025-09-27");
    assert.ok(fy25, "FY2025 balance row present");
    assert.ok((fy25?.totalAssets ?? 0) > 0);
    assert.ok((fy25?.stockholdersEquity ?? 0) > 0);
  });

  it("computes EBITDA from operating income plus D&A", () => {
    const fy24 = bundle?.income.find((r) => r.fiscalYear === "2024");
    assert.ok((fy24?.ebitda ?? 0) > (fy24?.operatingIncome ?? 0));
  });

  it("keeps Q4 diluted shares on the same scale as the annual WASO", () => {
    const fy25 = bundle?.income.find((r) => r.date === "2025-09-27");
    const q4 = bundle?.incomeQuarterly.find((r) => r.date === "2025-09-27");
    const annual = fy25?.dilutedAverageShares;
    const qShares = q4?.dilutedAverageShares;
    assert.ok(annual != null && annual > 1_000_000_000);
    assert.ok(qShares != null && qShares > 1_000_000_000);
    assert.ok(Math.abs(qShares! - annual!) / annual! < 0.2);
  });

  it("detects the filing currency", () => {
    assert.equal(detectReportingCurrency(facts), "USD");
  });
});

describe("buildFlowSeries", () => {
  it("returns nothing useful for too-thin input", () => {
    const s = buildFlowSeries([]);
    assert.equal(s.annual.size, 0);
    assert.equal(s.quarterly.size, 0);
  });

  it("prefers the latest filed value for a re-reported period", () => {
    const points: EdgarFactPoint[] = [
      { start: "2024-01-01", end: "2024-12-31", val: 100, form: "10-K", filed: "2025-02-01" },
      { start: "2024-01-01", end: "2024-12-31", val: 110, form: "10-K/A", filed: "2025-06-01" },
    ];
    assert.equal(buildFlowSeries(points).annual.get("2024-12-31"), 110);
  });

  it("does not treat a ~365-day trailing-twelve-month fact from a 10-Q as a fiscal year", () => {
    const points: EdgarFactPoint[] = [
      // Real fiscal year from the annual filing.
      { start: "2024-01-01", end: "2024-12-31", val: 1000, form: "10-K", filed: "2025-02-01" },
      // TTM ending at a quarter-end, carried in a 10-Q — must be ignored, not annual.
      { start: "2024-04-01", end: "2025-03-31", val: 1100, form: "10-Q", filed: "2025-05-01" },
    ];
    const s = buildFlowSeries(points);
    assert.deepEqual([...s.annual.keys()], ["2024-12-31"]);
    assert.equal(s.annual.has("2025-03-31"), false);
  });

  it("recovers Q4 additive flows by YTD differencing", () => {
    const points: EdgarFactPoint[] = [
      { start: "2024-01-01", end: "2024-03-31", val: 100, form: "10-Q", filed: "2024-05-01" },
      { start: "2024-01-01", end: "2024-06-30", val: 210, form: "10-Q", filed: "2024-08-01" },
      { start: "2024-01-01", end: "2024-09-30", val: 330, form: "10-Q", filed: "2024-11-01" },
      { start: "2024-01-01", end: "2024-12-31", val: 500, form: "10-K", filed: "2025-02-01" },
    ];
    const s = buildFlowSeries(points);
    assert.equal(s.quarterly.get("2024-12-31"), 170);
  });

  it("does not YTD-difference weighted-average share counts", () => {
    const points: EdgarFactPoint[] = [
      { start: "2024-01-01", end: "2024-03-31", val: 330_000_000, form: "10-Q", filed: "2024-05-01" },
      { start: "2024-04-01", end: "2024-06-30", val: 331_000_000, form: "10-Q", filed: "2024-08-01" },
      { start: "2024-01-01", end: "2024-06-30", val: 330_500_000, form: "10-Q", filed: "2024-08-01" },
      { start: "2024-07-01", end: "2024-09-30", val: 332_000_000, form: "10-Q", filed: "2024-11-01" },
      { start: "2024-01-01", end: "2024-09-30", val: 331_000_000, form: "10-Q", filed: "2024-11-01" },
      { start: "2024-01-01", end: "2024-12-31", val: 333_000_000, form: "10-K", filed: "2025-02-01" },
    ];
    const s = buildFlowSeries(points, { differenceYtd: false });
    assert.equal(s.quarterly.get("2024-03-31"), 330_000_000);
    assert.equal(s.quarterly.get("2024-06-30"), 331_000_000);
    assert.equal(s.quarterly.get("2024-09-30"), 332_000_000);
    // Missing 3-month Q4 → annual WASO, not FY − 9mo (≈ 2M).
    assert.equal(s.quarterly.get("2024-12-31"), 333_000_000);
    assert.notEqual(s.quarterly.get("2024-12-31"), 333_000_000 - 331_000_000);
  });
});

describe("buildInstantSeries", () => {
  it("marks a date annual when any filing reported it in a 10-K, even if a 10-Q comparative filed later", () => {
    const points: EdgarFactPoint[] = [
      { end: "2024-12-31", val: 500, form: "10-K", filed: "2025-02-01" },
      { end: "2024-12-31", val: 500, form: "10-Q", filed: "2025-05-01" },
      { end: "2025-03-31", val: 520, form: "10-Q", filed: "2025-05-01" },
    ];
    const s = buildInstantSeries(points);
    assert.equal(s.annual.get("2024-12-31"), 500);
    assert.equal(s.annual.has("2025-03-31"), false);
    assert.equal(s.quarterly.get("2025-03-31"), 520);
  });
});

describe("bundleFromCompanyFacts: foreign filer with sparse USD convenience translation (SAP case)", () => {
  const a = (start: string, end: string, val: number): EdgarFactPoint => ({
    start,
    end,
    val,
    form: "20-F",
    filed: end.slice(0, 4) + "-02-28",
  });
  const dual: EdgarCompanyFacts = {
    cik: 2,
    entityName: "Dual Unit AG",
    facts: {
      "ifrs-full": {
        Revenue: {
          units: {
            // Full history in the reporting currency…
            EUR: [
              a("2022-01-01", "2022-12-31", 100),
              a("2023-01-01", "2023-12-31", 110),
              a("2024-01-01", "2024-12-31", 120),
            ],
            // …USD present only as a one-off convenience translation.
            USD: [a("2023-01-01", "2023-12-31", 118)],
          },
        },
        ProfitLoss: {
          units: {
            EUR: [
              a("2022-01-01", "2022-12-31", 10),
              a("2023-01-01", "2023-12-31", 11),
              a("2024-01-01", "2024-12-31", 12),
            ],
            USD: [a("2023-01-01", "2023-12-31", 11.8)],
          },
        },
      },
    },
  };

  it("keeps the full reporting-currency history instead of the sparse USD set", () => {
    const b = bundleFromCompanyFacts("DUAG", dual);
    assert.ok(b);
    assert.equal(b?.income.length, 3);
    assert.equal(b?.income.find((r) => r.fiscalYear === "2024")?.revenue, 120);
    assert.equal(detectReportingCurrency(dual), "EUR");
  });
});

describe("bundleFromCompanyFacts guards", () => {
  it("returns null when there is no usable annual income data", () => {
    const empty: EdgarCompanyFacts = { cik: 1, entityName: "X", facts: { "us-gaap": {} } };
    assert.equal(bundleFromCompanyFacts("X", empty), null);
  });
});
