/**
 * Vercel `npm run build` selector.
 *
 * Preview/CI have no usable DATABASE_URL (no Supabase branch). `prisma db push`
 * in the default build is what failed Preview of potencial-fixes (cef8239).
 * Production keeps db push + lock SQL. Uses VERCEL_ENV (set by Vercel) — not a
 * custom flag.
 */

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** True only on Vercel Production when DATABASE_URL and DIRECT_URL are configured. */
export function shouldApplyPrismaSchema(env = process.env) {
  const vercelEnv = env.VERCEL_ENV ?? "";
  const hasDatabaseUrl = Boolean(env.DATABASE_URL && String(env.DATABASE_URL).trim());
  const hasDirectUrl = Boolean(env.DIRECT_URL && String(env.DIRECT_URL).trim());
  return vercelEnv === "production" && hasDatabaseUrl && hasDirectUrl;
}

export function prismaBuildScriptName(env = process.env) {
  return shouldApplyPrismaSchema(env) ? "build:with-db" : "build:skip-db";
}

function main() {
  const gen = spawnSync("npx", ["prisma", "generate"], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  if (gen.status !== 0) {
    process.exit(gen.status === null ? 1 : gen.status);
  }

  const script = prismaBuildScriptName();
  const vercelEnv = process.env.VERCEL_ENV || "unset";
  console.log(`[build] npm run ${script} (VERCEL_ENV=${vercelEnv})`);
  const result = spawnSync("npm", ["run", script], {
    stdio: "inherit",
    env: process.env,
    shell: process.platform === "win32",
  });
  process.exit(result.status === null ? 1 : result.status);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main();
}
