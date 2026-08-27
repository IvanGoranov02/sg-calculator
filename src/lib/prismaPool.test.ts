import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { configurePooledDatabaseUrl, isTransientPrismaError } from "@/lib/prismaPool";

describe("configurePooledDatabaseUrl", () => {
  it("adds pgbouncer + connection_limit=1 on port 6543", () => {
    const out = configurePooledDatabaseUrl(
      "postgresql://user:pass@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require",
    );
    const u = new URL(out);
    assert.equal(u.searchParams.get("pgbouncer"), "true");
    assert.equal(u.searchParams.get("connection_limit"), "1");
    assert.equal(u.searchParams.get("pool_timeout"), "8");
    assert.equal(u.searchParams.get("sslmode"), "require");
    assert.equal(u.password, "pass");
    assert.equal(u.port, "6543");
  });

  it("does not override an existing connection_limit", () => {
    const out = configurePooledDatabaseUrl(
      "postgresql://u:p@host:6543/postgres?pgbouncer=true&connection_limit=5",
    );
    const u = new URL(out);
    assert.equal(u.searchParams.get("connection_limit"), "5");
    assert.equal(u.searchParams.get("pgbouncer"), "true");
  });

  it("leaves session-mode / direct URLs (5432) unchanged", () => {
    const src = "postgresql://u:p@aws-1-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require";
    assert.equal(configurePooledDatabaseUrl(src), src);
  });

  it("returns unparseable strings unchanged", () => {
    assert.equal(configurePooledDatabaseUrl("not-a-url"), "not-a-url");
  });
});

describe("isTransientPrismaError", () => {
  it("matches known pooler hang / reset messages", () => {
    assert.equal(isTransientPrismaError(new Error("Server has closed the connection.")), true);
    assert.equal(isTransientPrismaError(new Error("Error: bytes remaining on stream")), true);
    assert.equal(isTransientPrismaError(new Error("Timed out fetching a new connection from the pool")), true);
    assert.equal(isTransientPrismaError({ code: "P1017", message: "x" }), true);
    assert.equal(isTransientPrismaError(new Error("unique constraint failed")), false);
  });
});
