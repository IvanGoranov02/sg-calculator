import assert from "node:assert/strict";
import { it, mock } from "node:test";

import { INSTANT_COMPANIES, loadStockCompanyIndex } from "@/lib/stockCompanyIndex";

it("shares concurrent loads, retries unavailable or malformed data, and reuses the parsed index", async () => {
  let requests = 0;
  const fullIndex = [{ s: "AAPL", n: "Apple Inc." }];
  const fetch = mock.method(globalThis, "fetch", async () => {
    requests += 1;
    if (requests === 1) return new Response("Unavailable", { status: 503 });
    if (requests === 2) return Response.json({ invalid: true });
    return Response.json(fullIndex);
  });
  try {
    const unavailable = loadStockCompanyIndex();
    assert.equal(loadStockCompanyIndex(), unavailable);
    assert.equal(await unavailable, INSTANT_COMPANIES);
    assert.equal(requests, 1);

    assert.equal(await loadStockCompanyIndex(), INSTANT_COMPANIES);
    assert.equal(requests, 2);

    const successful = loadStockCompanyIndex();
    assert.equal(loadStockCompanyIndex(), successful);
    const parsed = await successful;
    assert.deepEqual(parsed, fullIndex);
    assert.equal(await loadStockCompanyIndex(), parsed);
    assert.equal(requests, 3);
  } finally {
    fetch.mock.restore();
  }
});
