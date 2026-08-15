/** Run the simulator against a config file and print what happens, from
 * the terminal -- the Node counterpart to the browser UI, and the direct
 * port of fridge/__main__.py. YAML is a first-class format here, not just
 * something the browser happens to parse: this is how Luke's own existing
 * config keeps working without ever going near the app.
 *
 *   npx tsx src/cli.ts [lint] [--json] [--real] [--flows] <config path>
 *
 * Walks forward from today until the youngest person turns 100 -- the same
 * window the page uses.
 *
 *   --json   machine-readable, with nominal and real side by side. Agents
 *            were parsing the column-aligned text, which makes a padding
 *            tweak a breaking change for them.
 *   --real   the text report in today's dollars instead of nominal.
 *   --flows  annualised in/out/net per account, split by goal phase --
 *            the table that makes a plan checkable by hand.
 *   --start  run from a day other than today, so two variants compared
 *            across a session are still the same experiment.
 *   --help   the whole list, which is otherwise only in this comment.
 *
 *   lint     named findings instead of a projection. Combines with --json.
 */

import { readFileSync } from "node:fs";
import { horizonEnd, todayISO } from "./dates";
import { load } from "./model";
import { run } from "./simulate";
import { formatReport, parseArgs, reportJson, yearsBetween, USAGE } from "./report";
import { formatFlows, summarise } from "./flows";
import { formatFindings, lint } from "./lint";
import { checkPlan, formatCheck } from "./check";
import { compareOutcomes, type OutcomeComparison } from "./compare";

/** The whole console tool, exported so the bundled build is the *same* tool
 * rather than a second one.
 *
 * It used to be two. `cli-bundle.ts` had its own tiny main that printed a
 * report and understood no arguments at all -- so every command llms.txt
 * documents (`check`, `lint`, `--json`, `--real`, `--flows`) worked when run
 * from source and failed for anybody who downloaded the published bundle,
 * which is everybody it was written for. Nothing caught it, because the
 * tests all ran the source. */
export function runCli(argv: string[]): void {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  if (args.help) {
    console.log(USAGE);
    return;
  }

  const budget = load(readFileSync(args.path, "utf-8"));
  // Today unless told otherwise. `--start` matters for an agent comparing
  // variants across a session: without it, the same two configs run today
  // and run tomorrow are two different experiments.
  const start = args.start ?? todayISO();
  // The same window the page uses: until the youngest person turns 100.
  // It used to be a flat 40 years, which meant the console tool and the
  // site could give different answers about the same plan -- and the one
  // an agent sees would not be the one its user sees. A plan that survives
  // 40 years and dies in year 44 was reported as fine.
  const end = horizonEnd(budget.birthdays, start);

  if (args.compare) {
    const afterPath = args.path2!;
    const afterBudget = load(readFileSync(afterPath, "utf-8"));
    const before = { budget, result: run(budget, start, end), start, end };
    const after = { budget: afterBudget, result: run(afterBudget, start, end), start, end };
    const comparison = compareOutcomes(before, after);
    console.log(args.json ? JSON.stringify(comparison, null, 2) : formatComparison(comparison));
    return;
  }
  const result = run(budget, start, end);
  const { balances, completed, phases } = result;

  if (args.check) {
    const checked = checkPlan(budget, result, start, end);
    console.log(args.json ? JSON.stringify(checked, null, 2) : formatCheck(checked, budget));
    if (checked.next !== null) process.exitCode = 1;
    return;
  }

  if (args.lint) {
    const findings = lint(budget, result, start, end);
    console.log(args.json ? JSON.stringify(findings, null, 2) : formatFindings(findings));
    if (findings.some((finding) => finding.severity === "fail")) process.exitCode = 1;
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

function formatComparison(comparison: OutcomeComparison): string {
  const lines = ["before / after — exact differences, no winner:"];
  for (const milestone of comparison.milestones) {
    const dates = `${milestone.before ?? "not reached"} → ${milestone.after ?? "not reached"}`;
    lines.push(`  ${milestone.name}: ${dates}${milestone.days === null ? "" : ` (${milestone.days} days)`}`);
  }
  lines.push(`  first floor breach: ${comparison.firstFloorBreach.before ?? "none"} → ${comparison.firstFloorBreach.after ?? "none"}`);
  lines.push(`  retirement exhaustion: ${comparison.retirementExhaustion.before ?? "none"} → ${comparison.retirementExhaustion.after ?? "none"}`);
  return lines.join("\n");
}

// Only run when invoked directly (`npx tsx src/cli.ts ...`), not when
// something in here is imported for testing.
// The library bundle imports this module from `cli-bundle.ts`; in a bundled
// file `import.meta.url` is the same for both modules, so the usual URL guard
// would execute the command twice. Only the source entrypoint owns the direct
// invocation.
if (process.argv[1] && (process.argv[1].endsWith("/src/cli.ts") || process.argv[1].endsWith("\\src\\cli.ts"))) {
  runCli(process.argv.slice(2));
}
