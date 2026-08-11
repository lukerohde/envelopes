/** The engine as one self-contained file.
 *
 * Built to `dist/envelopes.mjs` and served from the site, so an AI agent
 * helping someone build a budget can actually *run* the numbers before
 * handing anything back -- without cloning the repo, installing anything, or
 * having Docker. One fetch, then:
 *
 *     import { report } from "./envelopes.mjs";
 *     console.log(report(yamlText));
 *
 * Everything js-yaml included; nothing to resolve at runtime. Works in Node
 * and in a browser -- there's no filesystem access anywhere in here, which
 * is exactly why it can be bundled for both.
 */

import { addDays, todayISO, type ISODate } from "./dates";
import { load, type Budget } from "./model";
import { run, type History } from "./simulate";
import { formatReport } from "./report";

export { load } from "./model";
export { run } from "./simulate";
export { formatReport } from "./report";
export { addDays, ageAt, todayISO } from "./dates";
export type { Budget, Account, Transfer, Goal } from "./model";

export interface SimulateOptions {
  /** Defaults to today. */
  start?: ISODate;
  /** How far forward to walk. Defaults to 40, same as the console tool. */
  years?: number;
  /** Account names to keep a day-by-day balance history for. */
  track?: string[];
}

export interface SimulateResult {
  budget: Budget;
  start: ISODate;
  end: ISODate;
  balances: Record<string, number>;
  /** Each goal that fired, with the date it did, in the order they fired. */
  completed: [string, ISODate][];
  /** Per tracked account, its balance on each day of the run. */
  history: History;
}

/** YAML text in, results out. The one call worth knowing. */
export function simulate(yamlText: string, options: SimulateOptions = {}): SimulateResult {
  const budget = load(yamlText);
  const start = options.start ?? todayISO();
  const end = addDays(start, Math.round(365.25 * (options.years ?? 40)));
  const { balances, completed, history } = run(budget, start, end, options.track ?? []);
  return { budget, start, end, balances, completed, history };
}

/** The same text the console tool prints -- milestones, then closing
 * balances. Handy for reading a draft config's outcome at a glance. */
export function report(yamlText: string, options: SimulateOptions = {}): string {
  const result = simulate(yamlText, options);
  return formatReport("config", result.start, result.budget, result.balances, result.completed);
}
