import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { prismaBuildScriptName, shouldApplyPrismaSchema } from "./vercel-build.mjs";

const vercelJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "vercel.json"), "utf8"),
);

describe("vercel.json", () => {
  it("uses npm run build so production can apply Prisma schema via vercel-build.mjs", () => {
    assert.equal(vercelJson.buildCommand, "npm run build");
  });
});

describe("shouldApplyPrismaSchema", () => {
  it("applies schema only on Vercel production with DATABASE_URL and DIRECT_URL", () => {
    assert.equal(
      shouldApplyPrismaSchema({
        VERCEL_ENV: "production",
        DATABASE_URL: "postgresql://x",
        DIRECT_URL: "postgresql://x",
      }),
      true,
    );
  });

  it("skips Preview even if DATABASE_URL is present", () => {
    assert.equal(
      shouldApplyPrismaSchema({ VERCEL_ENV: "preview", DATABASE_URL: "postgresql://x" }),
      false,
    );
  });

  it("skips production when DATABASE_URL or DIRECT_URL is missing or blank", () => {
    assert.equal(shouldApplyPrismaSchema({ VERCEL_ENV: "production" }), false);
    assert.equal(shouldApplyPrismaSchema({ VERCEL_ENV: "production", DATABASE_URL: "  " }), false);
    assert.equal(
      shouldApplyPrismaSchema({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://x" }),
      false,
    );
  });

  it("skips local / CI (no VERCEL_ENV)", () => {
    assert.equal(shouldApplyPrismaSchema({ DATABASE_URL: "postgresql://x" }), false);
    assert.equal(shouldApplyPrismaSchema({}), false);
  });
});

describe("prismaBuildScriptName", () => {
  it("maps production+db to build:with-db and everything else to build:skip-db", () => {
    assert.equal(
      prismaBuildScriptName({
        VERCEL_ENV: "production",
        DATABASE_URL: "postgresql://x",
        DIRECT_URL: "postgresql://x",
      }),
      "build:with-db",
    );
    assert.equal(
      prismaBuildScriptName({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://x" }),
      "build:skip-db",
    );
    assert.equal(prismaBuildScriptName({ VERCEL_ENV: "preview" }), "build:skip-db");
    assert.equal(prismaBuildScriptName({}), "build:skip-db");
  });
});
