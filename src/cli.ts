/** Run the simulator against a config file and print what happens, from
 * the terminal -- the Node counterpart to the browser UI, and the direct
 * port of fridge/__main__.py. YAML is a first-class format here, not just
 * something the browser happens to parse: this is how Luke's own existing
 * config keeps working without ever going near the app.
 *
 *   npx tsx src/cli.ts <config path>
 *
 * Walks 40 years forward from today, same as fridge/__main__.py.
 */

import { readFileSync } from "node:fs";
import { addDays, todayISO } from "./dates";
import { load } from "./model";
import { run } from "./simulate";
import { formatReport } from "./report";

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npx tsx src/cli.ts <config.yml>");
    process.exit(1);
  }
  const budget = load(readFileSync(path, "utf-8"));

  const start = todayISO();
  const end = addDays(start, Math.round(365.25 * 40));

  const { balances, completed } = run(budget, start, end);
  console.log(formatReport(path, start, budget, balances, completed));
}

// Only run when invoked directly (`npx tsx src/cli.ts ...`), not when
// formatReport is imported for testing.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
