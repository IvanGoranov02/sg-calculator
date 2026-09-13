import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { companyLogoUrl, fmpLogoSymbol } from "@/lib/companyLogo";

describe("companyLogo", () => {
  it("strips exchange suffix for FMP lookup", () => {
    assert.equal(fmpLogoSymbol("VOW3.DE"), "VOW3");
    assert.equal(fmpLogoSymbol("aapl"), "AAPL");
  });

  it("builds FMP image URL", () => {
    assert.equal(
      companyLogoUrl("BRK-B"),
      "https://financialmodelingprep.com/image-stock/BRK-B.png",
    );
  });
});
