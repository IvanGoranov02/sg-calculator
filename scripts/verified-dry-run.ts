/**
 * Dry run of the permanent store: what would be stored for each company? No database involved.
 * Usage: node --import tsx scripts/verified-dry-run.ts [N=100] [SYM,SYM...] [--rows]
 */
import { companyStatus, fetchFreshCompany } from "../src/lib/verified/service";
import { storeCoverage } from "../src/lib/verified/periods";
import { UNIVERSE } from "../src/lib/verified/universe";

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const showRows = process.argv.includes("--rows");
  const n = Number(args[0] ?? 100);
  const only = args[1]?.split(",");
  const symbols = only ?? UNIVERSE.slice(0, n).map((c) => c.s);
  const tally: Record<string, number> = {};
  const add = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
  for (const sym of symbols) {
    try {
      const fresh = await fetchFreshCompany(sym);
      const cov = storeCoverage(fresh.rows);
      const status = companyStatus(fresh.rows, fresh);
      const trust: Record<string, number> = {};
      for (const r of fresh.rows) trust[r.trust] = (trust[r.trust] ?? 0) + 1;
      add(status);
      add(cov.full ? "serve:store" : fresh.rows.length ? "serve:overlay" : "serve:pipeline");
      if (fresh.profile === "bank") add("bank");
      console.log(
        `${sym}\t${status}\t${cov.full ? "store  " : "overlay"}\t${fresh.profile}\tA${cov.annual} Q${cov.quarters}(run ${cov.contiguousQuarters})\t${JSON.stringify(trust)}\t${fresh.issues
          .slice(0, only ? 20 : 2)
          .map((e) => e.message)
          .join(" | ")}`,
      );
      if (showRows) {
        for (const r of fresh.rows) {
          const b = r.data.bank;
          console.log(
            `   ${r.kind} ${r.end} ${r.trust.padEnd(8)} rev=${r.data.inc.revenue} ni=${r.data.inc.netIncome} ocf=${r.data.cf?.operatingCashFlow ?? "-"} assets=${r.data.bs?.totalAssets ?? "-"}${
              b ? ` nii=${b.netInterestIncome} nonII=${b.nonInterestIncome} prov=${b.provisionForCreditLosses} dep=${b.deposits} loans=${b.loans}` : ""
            }`,
          );
        }
      }
    } catch (e) {
      add("error");
      console.log(`${sym}\tERROR\t${e instanceof Error ? e.message : e}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  console.log(`\n${symbols.length} companies`, tally);
}
void main();
