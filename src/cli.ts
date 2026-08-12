/** Run the simulator against a config file and print what happens, from
 * the terminal -- the Node counterpart to the browser UI, and the direct
 * port of fridge/__main__.py. YAML is a first-class format here, not just
 * something the browser happens to parse: this is how Luke's own existing
 * config keeps working without ever going near the app.
 *
 *   npx tsx src/cli.ts [lint] [--json] [--real] [--flows] <config path>
 *
 * Walks 40 years forward from today, same as fridge/__main__.py.
 *
 *   --json   machine-readable, with nominal and real side by side. Agents
 *            were parsing the column-aligned text, which makes a padding
 *            tweak a breaking change for them.
 *   --real   the text report in today's dollars instead of nominal.
 *   --flows  annualised in/out/net per account, split by goal phase --
 *            the table that makes a plan checkable by hand.
 *
 *   lint     named findings instead of a projection. Combines with --json.
 */

import { readFileSync } from "node:fs";
import { addDays, horizonYears, todayISO } from "./dates";
import { load } from "./model";
import { run } from "./simulate";
import { formatReport, parseArgs, reportJson, yearsBetween } from "./report";
import { formatFlows, summarise } from "./flows";
import { formatFindings, lint } from "./lint";

function main(): void {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  const budget = load(readFileSync(args.path, "utf-8"));
  const start = todayISO();
  // The same window the page uses: until the youngest person turns 100.
  // It used to be a flat 40 years, which meant the console tool and the
  // site could give different answers about the same plan -- and the one
  // an agent sees would not be the one its user sees. A plan that survives
  // 40 years and dies in year 44 was reported as fine.
  const end = addDays(start, Math.round(365.25 * horizonYears(budget.birthdays, start)));
  const result = run(budget, start, end);
  const { balances, completed, phases } = result;

  if (args.lint) {
    const findings = lint(budget, result, start, end);
    console.log(args.json ? JSON.stringify(findings, null, 2) : formatFindings(findings));
    if (findings.length > 0) process.exitCode = 1;
    return;
  }

  if (args.json) {
    console.log(JSON.stringify(reportJson(args.path, start, end, budget, balances, completed), null, 2));
    return;
  }

  const real = args.real ? { inflation: budget.inflation, years: yearsBetween(start, end) } : undefined;
  console.log(formatReport(args.path, start, budget, balances, completed, { real }));
  if (args.flows) {
    console.log("");
    console.log(formatFlows(summarise(phases, budget, start, args.real), args.real));
  }
}

// Only run when invoked directly (`npx tsx src/cli.ts ...`), not when
// formatReport is imported for testing.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
