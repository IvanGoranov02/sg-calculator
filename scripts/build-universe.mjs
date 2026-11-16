/**
 * Builds src/lib/verified/universe.json: the companies kept in the permanent fundamentals
 * store — the 1000 largest worldwide plus the 1000 largest US-listed.
 *
 * Usage: node scripts/build-universe.mjs <world-ranking.csv>
 * The CSV is a market-cap ranking export with the columns Rank, Name, Symbol, marketcap,
 * price, country (symbols in Yahoo format). US ranks come from public/us-companies.json.
 */
import { readFileSync, writeFileSync } from "node:fs";

const WORLD_TOP = 1000;
const US_TOP = 1000;
/** Share classes of the same company: keep the one the site already uses. */
const ALIAS = { GOOG: "GOOGL", "BRK-A": "BRK-B", "BRK.B": "BRK-B", "BRK.A": "BRK-B" };

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const csvPath = process.argv[2];
if (!csvPath) throw new Error("Pass the world ranking CSV path.");
const lines = readFileSync(csvPath, "utf8").split(/\r?\n/).filter(Boolean).slice(1);
const us = JSON.parse(readFileSync("public/us-companies.json", "utf8"));

/** symbol -> { s, n, c, w?, u? } */
const bySymbol = new Map();
const valid = (s) => /^[A-Z0-9.\-]{1,32}$/.test(s);

us.slice(0, US_TOP).forEach((row, i) => {
  const s = String(row.s).toUpperCase();
  if (!valid(s)) return;
  bySymbol.set(s, { s, n: row.n, c: "", u: i + 1 });
});

let worldRank = 0;
for (const line of lines) {
  if (worldRank >= WORLD_TOP) break;
  const [, name, rawSymbol, , , country] = parseCsvLine(line);
  let s = String(rawSymbol ?? "").trim().toUpperCase();
  if (!s || !valid(s)) continue;
  s = ALIAS[s] ?? s;
  worldRank++;
  const prev = bySymbol.get(s);
  if (prev) {
    if (prev.w == null) prev.w = worldRank;
    if (!prev.c) prev.c = country;
    continue;
  }
  bySymbol.set(s, { s, n: name, c: country, w: worldRank });
}

const rows = [...bySymbol.values()].sort(
  (a, b) => Math.min(a.w ?? 1e9, a.u ?? 1e9) - Math.min(b.w ?? 1e9, b.u ?? 1e9) || a.s.localeCompare(b.s),
);
writeFileSync("src/lib/verified/universe.json", `${JSON.stringify(rows)}\n`);
const world = rows.filter((r) => r.w != null).length;
const usCount = rows.filter((r) => r.u != null).length;
console.log(`${rows.length} companies (${world} world top, ${usCount} US top, ${rows.filter((r) => r.w != null && r.u != null).length} in both)`);
