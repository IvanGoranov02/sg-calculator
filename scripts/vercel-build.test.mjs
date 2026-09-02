import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { prismaBuildScriptName, shouldApplyPrismaSchema } from "./vercel-build.mjs";

describe("shouldApplyPrismaSchema", () => {
  it("applies schema only on Vercel production with DATABASE_URL", () => {
    assert.equal(
      shouldApplyPrismaSchema({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://x" }),
      true,
    );
  });

  it("skips Preview even if DATABASE_URL is present", () => {
    assert.equal(
      shouldApplyPrismaSchema({ VERCEL_ENV: "preview", DATABASE_URL: "postgresql://x" }),
      false,
    );
  });

  it("skips production when DATABASE_URL is missing or blank", () => {
    assert.equal(shouldApplyPrismaSchema({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldApplyPrismaSchema({ VERCEL_ENV: "production", DATABASE_URL: "  " }), false);
  });

  it("skips local / CI (no VERCEL_ENV)", () => {
    assert.equal(shouldApplyPrismaSchema({ DATABASE_URL: "postgresql://x" }), false);
    assert.equal(shouldApplyPrismaSchema({}), false);
  });
});

describe("prismaBuildScriptName", () => {
  it("maps production+db to build:with-db and everything else to build:skip-db", () => {
    assert.equal(
      prismaBuildScriptName({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://x" }),
      "build:with-db",
    );
    assert.equal(prismaBuildScriptName({ VERCEL_ENV: "preview" }), "build:skip-db");
    assert.equal(prismaBuildScriptName({}), "build:skip-db");
  });
});
