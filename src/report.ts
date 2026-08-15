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

/** What to do, or null for the plain projection. A field rather than a
 * boolean each, because there are five of them now and only ever one at a
 * time -- five booleans can express four states that don't exist. */
export const VERBS = ["check", "lint", "compare", "link", "decode"] as const;
export type Verb = (typeof VERBS)[number];

export interface CliArgs {
  verb: Verb | null;
  /** The config file -- or, for `decode`, the share URL. It's whatever the
   * verb was pointed at. */
  path: string;
  /** `compare` is the only verb taking a second one. */
  path2?: string;
  json: boolean;
  real: boolean;
  flows: boolean;
  /** `--help` / `-h` -- print usage and stop, before anything asks for a path. */
  help: boolean;
  /** `--start=YYYY-MM-DD` or `--start YYYY-MM-DD` -- defaults to today. Moves
   * the horizon with it, since the run always ends when the youngest person
   * turns 100 from wherever it starts. */
  start?: ISODate;
}

export const USAGE = `usage: envelopes [check|lint] [--json] [--real] [--flows] [--start=YYYY-MM-DD] <config.yml>
   or: envelopes compare [--json] [--start=YYYY-MM-DD] <before.yml> <after.yml>
   or: envelopes link <config.yml>
   or: envelopes decode '<share url>'
   or: envelopes --help

verbs:
  (none)   the projection: milestones, then closing balances
  check    what to fix, in order -- criteria plus the one next step
  lint     named findings only, no projection
  compare  the same run for two configs, exact differences, no winner
  link     a share link for this config, checked by decoding it back first
  decode   the YAML inside a share link -- quote the URL, it contains a #

flags:
  --json    machine-readable, nominal and real balances together
  --real    the text report in today's dollars instead of nominal
  --flows   annualised in/out/net per account, split by goal phase
  --start   the day the run begins (default: today) -- moves the horizon
            with it, since the run ends when the youngest person turns 100
  --help    this text, then stop`;

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/** Deliberately tiny: one verb, a handful of flags -- only `--start` takes a
 * value -- and a path. Anything that wants real argument parsing wants the
 * library instead. */
export function parseArgs(argv: string[]): CliArgs {
  const verb = (VERBS as readonly string[]).includes(argv[0]) ? (argv[0] as Verb) : null;
  const args: CliArgs = { verb, path: "", json: false, real: false, flows: false, help: false };
  if (verb === "compare") args.path2 = "";
  let i = verb === null ? 0 : 1;

  for (; i < argv.length; i++) {
    const arg = argv[i];
    // The two that don't fit the chain below: help wants no path at all, and
    // start is the only option here that takes a value.
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      return args;
    }
    if (arg === "--start" || arg.startsWith("--start=")) {
      const value = arg.startsWith("--start=") ? arg.slice("--start=".length) : argv[++i];
      // A start date the engine can't read would silently run from nowhere,
      // which is worse than refusing.
      if (!value || !DATE_SHAPE.test(value)) {
        throw new Error(`--start needs a date like YYYY-MM-DD, got: ${value ?? "nothing"}`);
      }
      args.start = value;
      continue;
    }
    if (arg === "--json") args.json = true;
    else if (arg === "--real") args.real = true;
    else if (arg === "--flows") args.flows = true;
    else if (arg.startsWith("-")) throw new Error(`unknown option: ${arg}`);
    else if (!args.path) args.path = arg;
    else if (args.verb === "compare" && !args.path2) args.path2 = arg;
    else throw new Error(USAGE);
  }
  if (!args.path || (args.verb === "compare" && !args.path2)) throw new Error(USAGE);
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
