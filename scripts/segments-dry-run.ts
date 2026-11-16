/**
 * Dry run of the revenue-by-business-line reader. No database involved.
 * Usage: node --import tsx scripts/segments-dry-run.ts SYM,SYM...
 */
import { collectSegments } from "../src/lib/verified/segments";

async function main() {
  const symbols = (process.argv[2] ?? "GOOGL").split(",");
  for (const sym of symbols) {
    const t0 = Date.now();
    try {
      let state = null;
      // Each pass has a time budget, like on the server; repeat until complete.
      for (let pass = 0; pass < 6; pass++) {
        state = await collectSegments(sym, state, 20_000);
        if (!state || state.complete) break;
      }
      if (!state || state.names.length === 0) {
        console.log(`${sym}\tno breakdown that adds up to total revenue (${Date.now() - t0}ms)`);
        continue;
      }
      console.log(`${sym}\tA${state.annual.length} Q${state.quarterly.length}\tfilings ${state.done.length}\t${Date.now() - t0}ms`);
      console.log(`   ${state.names.join(" | ")}`);
      const last = state.quarterly[state.quarterly.length - 1];
      if (last) console.log(`   ${last.date}: ${state.names.map((n) => `${n}=${last.values[n] ?? "-"}`).join(", ")}`);
      console.log(`   quarters: ${state.quarterly.map((q) => q.date).join(" ")}`);
    } catch (e) {
      console.log(`${sym}\tERROR ${e instanceof Error ? e.message : e}`);
    }
  }
}
void main();
