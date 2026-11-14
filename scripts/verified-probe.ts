/** Debug helper: show raw SEC facts for one concept. Usage: node --import tsx scripts/verified-probe.ts SYM Concept [minEnd] */
import { fetchCompanyFacts, lookupCik } from "../src/lib/edgar/client";

async function main() {
  const [sym, concept, minEnd = "2021-01-01"] = process.argv.slice(2);
  const entry = await lookupCik(sym);
  console.log("cik", entry);
  if (!entry) return;
  const facts = await fetchCompanyFacts(entry.cik);
  if (!facts) return console.log("no facts");
  for (const ns of Object.keys(facts.facts)) {
    if (!concept) {
      console.log(ns, Object.keys(facts.facts[ns]).filter((k) => /NetIncome|ProfitLoss|^Revenue/.test(k)).join(", "));
      continue;
    }
    const e = facts.facts[ns]?.[concept];
    if (!e) continue;
    for (const [unit, pts] of Object.entries(e.units)) {
      console.log(ns, unit, pts.length);
      for (const p of pts.filter((p) => p.end >= minEnd).slice(-28)) {
        console.log(`  ${p.start ?? "          "} ${p.end} ${p.val} ${p.form} ${p.filed}`);
      }
    }
  }
}
void main();
