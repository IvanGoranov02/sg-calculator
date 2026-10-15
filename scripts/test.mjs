import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Discover every regression test. Importing them starts Node's test harness in
// this process, avoiding Node 24/tsx's file-only results and unnecessary child processes.
const files = ["src", "scripts"].flatMap((root) =>
  readdirSync(root, { recursive: true })
    .filter((file) => /\.test\.(ts|mjs)$/.test(file))
    .map((file) => `${root}/${file}`),
).sort();
for (const file of files) await import(pathToFileURL(file).href);
