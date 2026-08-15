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
import { horizonEnd, todayISO, yearsBetween } from "./dates";
import { load } from "./model";
import { run } from "./simulate";
import { formatReport, parseArgs, reportJson, USAGE } from "./report";
import { formatFlows, summarise } from "./flows";
import { formatFindings, lint } from "./lint";
import { checkPlan, formatCheck } from "./check";
import { compareOutcomes, type OutcomeComparison } from "./compare";
import { decodeShareUrl, encodeShareUrl } from "./share";

/** The whole console tool, exported so the bundled build is the *same* tool
 * rather than a second one.
 *
 * It used to be two. `cli-bundle.ts` had its own tiny main that printed a
 * report and understood no arguments at all -- so every command llms.txt
 * documents (`check`, `lint`, `--json`, `--real`, `--flows`) worked when run
 * from source and failed for anybody who downloaded the published bundle,
 * which is everybody it was written for. Nothing caught it, because the
 * tests all ran the source. */
export async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (args.verb === "decode") {
    console.log(await decode(args.path));
    return;
  }

  const yamlText = readFileSync(args.path, "utf-8");
  const budget = load(yamlText);

  // A link is made from the text, not the parsed budget -- comments and all,
  // exactly as written. load() above still ran, so a link is never made from
  // a plan that doesn't even parse.
  if (args.verb === "link") {
    await printLink(yamlText);
    return;
  }

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

  if (args.verb === "compare") {
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

  if (args.verb === "check") {
    const checked = checkPlan(budget, result, start, end);
    console.log(args.json ? JSON.stringify(checked, null, 2) : formatCheck(checked, budget));
    if (checked.next !== null) process.exitCode = 1;
    return;
  }

  if (args.verb === "lint") {
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

/** Long enough that a chat client starts wrapping or truncating it. Not a
 * hard limit -- the page will happily load a much longer one -- just the
 * point where handing over the YAML as well stops being optional. */
const LONG_LINK = 2000;

/** Prints a share link, having first decoded its own output and checked it
 * came back the same.
 *
 * This is here because a link is the one thing an agent hands over that it
 * can't otherwise check. Twice now a good plan has arrived as a broken link
 * -- once abbreviated with an ellipsis inside markdown link text, once
 * mangled mid-generation -- and the person on the other end saw the sample
 * budget rather than theirs. The round trip can't catch a link damaged after
 * this point, but it can guarantee the one printed here was whole.
 *
 * The URL goes to stdout on its own, and everything else to stderr, so
 * `link plan.yml > link.txt` gives a file with a link in it and nothing else. */
async function printLink(yamlText: string): Promise<void> {
  const url = await encodeShareUrl(yamlText);
  if ((await decodeShareUrl(url)) !== yamlText) {
    throw new Error("that link doesn't decode back to the plan it was made from -- not printing it");
  }
  console.error(`${url.length} characters`);
  if (url.length > LONG_LINK) {
    console.error("long enough for a chat client to break it -- hand back the YAML as well, not instead");
  }
  console.log(url);
}

/** The YAML inside a share link. Loud when it won't decode, because the
 * alternative is printing rubbish that looks like a plan. */
async function decode(url: string): Promise<string> {
  try {
    return await decodeShareUrl(url);
  } catch (err) {
    throw new Error(
      `that share link won't decode: ${(err as Error).message}. It has probably been truncated or ` +
        `mangled in transit -- ask for it again as plain text, in a code block, on its own line.`,
    );
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
  runCli(process.argv.slice(2)).catch(reportAndExit);
}

/** One place every failure lands: a bad argument, a file that isn't there, a
 * config that won't load, a link that won't decode. Says what went wrong and
 * stops, rather than throwing a stack trace into bundle internals at somebody
 * who only wanted to know what was wrong with their budget. */
export function reportAndExit(err: unknown): void {
  console.error((err as Error).message);
  process.exit(1);
}
