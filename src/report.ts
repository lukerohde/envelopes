/** The console tool's output. Lives apart from cli.ts so it can be bundled
 * for anything that doesn't have a filesystem -- cli.ts reads files, this
 * only formats what a run produced.
 *
 * Two shapes, same numbers: text for a person, JSON for a program. The
 * split matters because agents were reading the text one, and column
 * alignment is a terrible API -- a change to `padEnd` shouldn't be able to
 * break somebody's script.
 */

import { ageAt, type ISODate } from "./dates";
import type { Budget } from "./model";

export interface CliArgs {
  path: string;
  json: boolean;
  real: boolean;
  flows: boolean;
  /** `envelopes lint plan.yml` -- report findings instead of a projection. */
  lint: boolean;
  /** `envelopes check plan.yml` -- lint, plus what a good plan looks like
   * and which single thing to do next. */
  check: boolean;
  /** `envelopes compare before.yml after.yml` -- same engine window for both. */
  compare?: boolean;
  path2?: string;
}

const USAGE = "usage: envelopes [check|lint] [--json] [--real] [--flows] <config.yml> | compare [--json] <before.yml> <after.yml>";

/** Deliberately tiny: one verb, three boolean flags and a path. Anything
 * that wants real argument parsing wants the library instead. */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { path: "", json: false, real: false, flows: false, lint: false, check: false };
  if (argv[0] === "lint") {
    args.lint = true;
    argv = argv.slice(1);
  } else if (argv[0] === "check") {
    args.check = true;
    argv = argv.slice(1);
  } else if (argv[0] === "compare") {
    args.compare = true;
    args.path2 = "";
    argv = argv.slice(1);
  }
  for (const arg of argv) {
    if (arg === "--json") args.json = true;
    else if (arg === "--real") args.real = true;
    else if (arg === "--flows") args.flows = true;
    else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    else if (!args.path) args.path = arg;
    else if (args.compare && !args.path2) args.path2 = arg;
    else throw new Error(USAGE);
  }
  if (!args.path || (args.compare && !args.path2)) throw new Error(USAGE);
  return args;
}

/** What a future amount would buy today. $1.66M of super in 2038 is about
 * $1.16M in today's money, and an escalating drawdown that looks like it
 * grows every year is actually flat -- neither is visible while every
 * figure on screen is nominal. */
export function deflate(amount: number, inflation: number, years: number): number {
  return amount / (1 + inflation) ** years;
}

export function yearsBetween(start: ISODate, end: ISODate): number {
  return (Date.parse(end) - Date.parse(start)) / (365.25 * 24 * 60 * 60 * 1000);
}

export interface RealOptions {
  inflation: number;
  years: number;
}

export function formatReport(
  path: string,
  start: ISODate,
  budget: Budget,
  balances: Record<string, number>,
  completed: [string, ISODate][],
  options: { real?: RealOptions } = {},
): string {
  const lines: string[] = [];
  lines.push(`${path}, from ${start}`);
  lines.push("");

  lines.push("milestones:");
  for (const [name, when] of completed) {
    const ages: string[] = [];
    for (const person of budget.birthdays) ages.push(String(ageAt(person.born, when)));
    lines.push(`  ${name.padEnd(30)} ${when}   ${ages.join("/")}`);
  }

  // An expense envelope's closing figure isn't money anyone has -- it's
  // everything that ever passed through it. `groceries 1,197,776.46` under a
  // heading saying "balances" reads as a bug; under one saying what it
  // actually is, it reads as information.
  const held: string[] = [];
  const spent: string[] = [];
  for (const name of Object.keys(balances).sort()) {
    (budget.account(name).kind === "expense" ? spent : held).push(name);
  }

  const inTodaysDollars = options.real ? ", in today's dollars" : "";
  const money = (name: string): string => {
    const amount = options.real
      ? deflate(balances[name], options.real.inflation, options.real.years)
      : balances[name];
    const value = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `  ${name.padEnd(24)} ${value.padStart(14)}`;
  };

  lines.push("");
  lines.push(`balances at the end of the run${inTodaysDollars}:`);
  for (const name of held) lines.push(money(name));

  if (spent.length > 0) {
    lines.push("");
    lines.push(`spent by category since ${start}${inTodaysDollars}:`);
    for (const name of spent) lines.push(money(name));
  }

  return lines.join("\n");
}

export interface JsonMilestone {
  name: string;
  date: ISODate;
  ages: Record<string, number>;
}

export interface JsonReport {
  config: string;
  start: ISODate;
  end: ISODate;
  inflation: number;
  milestones: JsonMilestone[];
  /** Both, always. Which one you want depends on the question, and an agent
   * shouldn't have to re-run with a different flag to change its mind. */
  balances: Record<string, { nominal: number; real: number }>;
}

export function reportJson(
  path: string,
  start: ISODate,
  end: ISODate,
  budget: Budget,
  balances: Record<string, number>,
  completed: [string, ISODate][],
): JsonReport {
  const milestones: JsonMilestone[] = [];
  for (const [name, date] of completed) {
    const ages: Record<string, number> = {};
    for (const person of budget.birthdays) ages[person.name] = ageAt(person.born, date);
    milestones.push({ name, date, ages });
  }

  const years = yearsBetween(start, end);
  const both: JsonReport["balances"] = {};
  for (const name of Object.keys(balances).sort()) {
    both[name] = {
      nominal: balances[name],
      real: deflate(balances[name], budget.inflation, years),
    };
  }

  return { config: path, start, end, inflation: budget.inflation, milestones, balances: both };
}
