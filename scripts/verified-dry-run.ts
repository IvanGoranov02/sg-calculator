/**
 * Dry run: how many of the top-N companies pass verification? No database involved.
 * Usage: node --import tsx scripts/verified-dry-run.ts [N=100] [SYM,SYM...]
 */
import { readFileSync } from "node:fs";

import { fetchCompanyFacts, lookupCik } from "../src/lib/edgar/client";
import { buildStatementsFromFacts, verifyStatements } from "../src/lib/verified/verify";
import { fetchYahooFundamentalsPayload } from "../src/lib/yahooFundamentalsMerge";

async function main() {
  const n = Number(process.argv[2] ?? 100);
  const only = process.argv[3]?.split(",");
  const all = JSON.parse(readFileSync("public/us-companies.json", "utf8")) as { s: string }[];
  const symbols = only ?? all.slice(0, n).map((c) => c.s);
  let ok = 0;
  const codes: Record<string, number> = {};
  for (const sym of symbols) {
    const entry = await lookupCik(sym);
    const facts = entry ? await fetchCompanyFacts(entry.cik) : null;
    const st = facts ? buildStatementsFromFacts(sym, facts) : null;
    if (!st) {
      console.log(`${sym}\tFAIL\tno SEC filing data`);
      codes.no_filings = (codes.no_filings ?? 0) + 1;
      continue;
    }
    const yahoo = await fetchYahooFundamentalsPayload(sym);
    const rep = verifyStatements(st, yahoo);
    if (rep.ok) ok++;
    for (const c of new Set(rep.errors.map((e) => e.code))) codes[c] = (codes[c] ?? 0) + 1;
    const shown = rep.errors
      .slice(0, only ? 40 : 3)
      .map((e) => e.message)
      .join(" | ");
    console.log(`${sym}\t${rep.ok ? "OK  " : "FAIL"}\tA${st.income.length} Q${st.incomeQuarterly.length} x${rep.crossChecked}\t${shown}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`\n${ok}/${symbols.length} verified`, codes);
}
void main();
