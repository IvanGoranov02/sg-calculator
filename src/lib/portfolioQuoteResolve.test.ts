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

  it("blocks ABE.F trap for legacy ABEAD-EQ keys without symbolT212", () => {
    const blocked = buildBlockedYahooSymbols("ABEAD-EQ", null);
    assert.ok(blocked.has("ABE.F"));
    assert.ok(blocked.has("ABEAD"));
  });

  it("blocks ABE.F trap for Xetra Alphabet listings", () => {
    const blocked = buildBlockedYahooSymbols("ABEAD", "ABEAd_EQ");
    assert.ok(blocked.has("ABE.F"));
    assert.ok(blocked.has("ABEAD"));
  });

  it("blocks UBE.DE trap for Xetra Uber listings", () => {
    const blocked = buildBlockedYahooSymbols("UBER.DE", "UBERd_EQ");
    assert.ok(blocked.has("UBE.DE"));
    assert.ok(blocked.has("UBE.F"));
    assert.ok(blocked.has("UBERD"));
  });

  it("blocks UBE.DE trap for legacy UBERD-EQ keys without symbolT212", () => {
    const blocked = buildBlockedYahooSymbols("UBERD-EQ", null);
    assert.ok(blocked.has("UBE.DE"));
    assert.ok(blocked.has("UBERD"));
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

  it("rejects ABE.F wrong instrument for Xetra Alphabet (ABEAd_EQ)", () => {
    const blocked = buildBlockedYahooSymbols("ABEAD", "ABEAd_EQ");
    const trap = {
      resolvedYahooSymbol: "ABE.F",
      currency: "EUR",
      price: 8.2,
      name: "Alphabet Inc. R",
      quoteType: "EQUITY",
    };
    const eu = {
      resolvedYahooSymbol: "ABEA.DE",
      currency: "EUR",
      price: 291.7,
      name: "Alphabet Inc.",
      quoteType: "EQUITY",
    };
    assert.equal(pickBestQuoteRow([trap], "EUR", "ABEAd_EQ", blocked), null);
    assert.equal(pickBestQuoteRow([trap, eu], "EUR", "ABEAd_EQ", blocked)?.resolvedYahooSymbol, "ABEA.DE");
  });

  it("rejects UBE.DE wrong instrument for Xetra Uber (UBERd_EQ)", () => {
    const blocked = buildBlockedYahooSymbols("UBER.DE", "UBERd_EQ");
    const trap = {
      resolvedYahooSymbol: "UBE.DE",
      currency: "EUR",
      price: 12.4,
      name: "Uber Technologies Inc. R",
      quoteType: "EQUITY",
    };
    const eu = {
      resolvedYahooSymbol: "UBER.DE",
      currency: "EUR",
      price: 72.5,
      name: "Uber Technologies, Inc.",
      quoteType: "EQUITY",
    };
    assert.equal(pickBestQuoteRow([trap], "EUR", "UBERd_EQ", blocked), null);
    assert.equal(pickBestQuoteRow([trap, eu], "EUR", "UBERd_EQ", blocked)?.resolvedYahooSymbol, "UBER.DE");
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

  it("prefers broker when brokerFirst is set (T212 synced holdings)", () => {
    const yahoo = {
      resolvedYahooSymbol: "AMZ.DE",
      currency: "EUR",
      price: 222,
      name: "AMAZON.COM INC.",
    };
    assert.equal(
      shouldPreferBrokerPrice(yahoo, { price: 220, currency: "EUR" }, "EUR", "AMZd_EQ", blocked, {
        brokerFirst: true,
      }),
      true,
    );
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
