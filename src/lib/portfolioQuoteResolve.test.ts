import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildBlockedYahooSymbols,
  isTrapQuoteRow,
  pickBestQuoteRow,
  shouldPreferBrokerPrice,
} from "@/lib/portfolioQuoteResolve";

describe("buildBlockedYahooSymbols", () => {
  it("blocks legacy AMZD key when T212 is Xetra Amazon", () => {
    const blocked = buildBlockedYahooSymbols("AMZD", "AMZd_EQ");
    assert.ok(blocked.has("AMZD"));
    assert.ok(blocked.has("AMZD")); // stored key
  });

  it("blocks METD trap for Xetra Meta listings", () => {
    const blocked = buildBlockedYahooSymbols("FB2AD", "FB2Ad_EQ");
    assert.ok(blocked.has("METD"));
    assert.ok(blocked.has("FB2AD"));
  });

  it("blocks METD for legacy FB2AD-EQ keys without symbolT212", () => {
    const blocked = buildBlockedYahooSymbols("FB2AD-EQ", null);
    assert.ok(blocked.has("METD"));
    assert.ok(blocked.has("FB2AD"));
  });
});

describe("pickBestQuoteRow", () => {
  it("rejects AMZD bear ETF for legacy stored key with T212 AMZd_EQ", () => {
    const blocked = buildBlockedYahooSymbols("AMZD", "AMZd_EQ");
    const bear = {
      resolvedYahooSymbol: "AMZD",
      currency: "USD",
      price: 8.47,
      name: "Direxion Daily AMZN Bear 1X ETF",
      quoteType: "ETF",
    };
    const eu = {
      resolvedYahooSymbol: "AMZ.DE",
      currency: "EUR",
      price: 220.1,
      name: "AMAZON.COM INC.",
      quoteType: "EQUITY",
    };

    assert.equal(pickBestQuoteRow([bear], "EUR", "AMZd_EQ", blocked), null);
    assert.equal(pickBestQuoteRow([bear, eu], "EUR", "AMZd_EQ", blocked)?.resolvedYahooSymbol, "AMZ.DE");
    assert.equal(pickBestQuoteRow([bear], "EUR", "AMZd_EQ", blocked)?.resolvedYahooSymbol, undefined);
  });

  it("rejects score-0 USD row for EUR non-US T212 listing when EUR row exists", () => {
    const blocked = buildBlockedYahooSymbols("MSFTD", "MSFTd_EQ");
    const us = {
      resolvedYahooSymbol: "MSFT",
      currency: "USD",
      price: 499,
      name: "Microsoft Corporation",
      quoteType: "EQUITY",
    };
    const eu = {
      resolvedYahooSymbol: "MSF.DE",
      currency: "EUR",
      price: 431,
      name: "MICROSOFT CORP.",
      quoteType: "EQUITY",
    };
    assert.equal(pickBestQuoteRow([us, eu], "EUR", "MSFTd_EQ", blocked)?.resolvedYahooSymbol, "MSF.DE");
    assert.equal(pickBestQuoteRow([us], "EUR", "MSFTd_EQ", blocked), null);
  });

  it("rejects METD bear ETF for Xetra Meta (FB2Ad_EQ)", () => {
    const blocked = buildBlockedYahooSymbols("FB2AD", "FB2Ad_EQ");
    const bear = {
      resolvedYahooSymbol: "METD",
      currency: "USD",
      price: 15.5,
      name: "Direxion Daily META Bear 1X ETF",
      quoteType: "ETF",
    };
    const eu = {
      resolvedYahooSymbol: "FB2A.DE",
      currency: "EUR",
      price: 526,
      name: "Meta Platforms Inc.",
      quoteType: "EQUITY",
    };
    assert.equal(pickBestQuoteRow([bear], "EUR", "FB2Ad_EQ", blocked), null);
    assert.equal(pickBestQuoteRow([bear, eu], "EUR", "FB2Ad_EQ", blocked)?.resolvedYahooSymbol, "FB2A.DE");
  });
});

describe("shouldPreferBrokerPrice", () => {
  const blocked = buildBlockedYahooSymbols("AMZ.DE", "AMZd_EQ");

  it("does not prefer broker when Yahoo matches holding currency", () => {
    const yahoo = {
      resolvedYahooSymbol: "AMZ.DE",
      currency: "EUR",
      price: 222,
      name: "AMAZON.COM INC.",
    };
    const broker = { price: 220, currency: "EUR" };
    assert.equal(shouldPreferBrokerPrice(yahoo, broker, "EUR", "AMZd_EQ", blocked), false);
  });

  it("prefers broker when Yahoo is missing", () => {
    assert.equal(shouldPreferBrokerPrice(null, { price: 220, currency: "EUR" }, "EUR", "AMZd_EQ", blocked), true);
  });

  it("prefers broker when Yahoo is a trap", () => {
    const trap = {
      resolvedYahooSymbol: "AMZD",
      currency: "USD",
      price: 8,
      name: "Direxion Daily AMZN Bear 1X ETF",
      quoteType: "ETF",
    };
    assert.equal(
      shouldPreferBrokerPrice(trap, { price: 220, currency: "EUR" }, "EUR", "AMZd_EQ", blocked),
      true,
    );
  });

  it("prefers broker when Yahoo currency mismatches holding", () => {
    const us = {
      resolvedYahooSymbol: "AMZN",
      currency: "USD",
      price: 258,
      name: "Amazon.com, Inc.",
    };
    assert.equal(shouldPreferBrokerPrice(us, { price: 220, currency: "EUR" }, "EUR", "AMZd_EQ", blocked), true);
  });
});

describe("isTrapQuoteRow", () => {
  it("flags AMZD for EU T212 context", () => {
    const blocked = buildBlockedYahooSymbols("AMZD", "AMZd_EQ");
    assert.equal(
      isTrapQuoteRow(
        {
          resolvedYahooSymbol: "AMZD",
          currency: "USD",
          price: 8,
          name: "Direxion Daily AMZN Bear 1X ETF",
          quoteType: "ETF",
        },
        "AMZd_EQ",
        blocked,
      ),
      true,
    );
  });

  it("flags METD for EU Meta T212 context", () => {
    const blocked = buildBlockedYahooSymbols("FB2AD", "FB2Ad_EQ");
    assert.equal(
      isTrapQuoteRow(
        {
          resolvedYahooSymbol: "METD",
          currency: "USD",
          price: 15.5,
          name: "Direxion Daily META Bear 1X ETF",
          quoteType: "ETF",
        },
        "FB2Ad_EQ",
        blocked,
      ),
      true,
    );
  });
});
