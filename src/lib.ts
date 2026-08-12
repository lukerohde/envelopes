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
import { run, type History, type Phase } from "./simulate";
import { formatReport, reportJson as asJson, type JsonReport } from "./report";
import { lint, type Finding } from "./lint";

export { load } from "./model";
export { run } from "./simulate";
export { formatReport, deflate } from "./report";
export type { JsonReport, JsonMilestone } from "./report";
export { addDays, ageAt, todayISO } from "./dates";
export type { Budget, Account, Transfer, Goal } from "./model";

/** The share-link codec. Written for the browser, but every global it uses
 * -- CompressionStream, btoa, atob -- has been standard in Node since 18,
 * so it runs unchanged wherever this bundle does. Without these an agent
 * handed a share link has to hand-roll gzip and base64url to read it, and
 * `llms.txt` has to talk it out of trying. All four are async. */
export { encodeShareUrl, decodeShareUrl, encodeShareHash, decodeShareHash } from "./share";

/** Per-phase flow tables and the named findings built on them. `lintPlan`
 * below is the one worth reaching for -- it takes YAML text and hands back
 * a list of things wrong with the plan. */
export { summarise, formatFlows, annualise, coverYears } from "./flows";
export { formatFindings } from "./lint";
export { checkPlan, formatCheck } from "./check";
export type { PlanCheck, Criterion } from "./check";
export type { Finding, Rule } from "./lint";
export type { Phase, AccountFlow } from "./simulate";
export type { PhaseSummary, FlowRow } from "./flows";

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
  /** In/out/interest per account, split at each goal completion. */
  phases: Phase[];
  /** Balances as at the day the plan first ran out -- see RunResult. */
  balancesAtEnd: Record<string, number> | null;
}

/** YAML text in, results out. The one call worth knowing. */
export function simulate(yamlText: string, options: SimulateOptions = {}): SimulateResult {
  const budget = load(yamlText);
  const start = options.start ?? todayISO();
  const end = addDays(start, Math.round(365.25 * (options.years ?? 40)));
  const { balances, completed, history, phases, balancesAtEnd } = run(budget, start, end, options.track ?? []);
  return { budget, start, end, balances, completed, history, phases, balancesAtEnd };
}

/** The same text the console tool prints -- milestones, then closing
 * balances. Handy for reading a draft config's outcome at a glance. */
export function report(yamlText: string, options: SimulateOptions = {}): string {
  const result = simulate(yamlText, options);
  return formatReport("config", result.start, result.budget, result.balances, result.completed);
}

/** The same run as an object rather than a page of text. Column-aligned
 * output is a bad thing to parse -- a change to the padding shouldn't be
 * able to break somebody's script -- and this carries nominal and real
 * balances side by side, so nothing has to be re-run to see both. */
export function reportJson(yamlText: string, options: SimulateOptions = {}): JsonReport {
  const result = simulate(yamlText, options);
  return asJson("config", result.start, result.end, result.budget, result.balances, result.completed);
}

/** Everything wrong with a plan, named. The rules read the same per-phase
 * flows the report shows, so every finding can be checked against the row
 * it came from -- a linter nobody can verify is a linter nobody trusts. */
export function lintPlan(yamlText: string, options: SimulateOptions = {}): Finding[] {
  const result = simulate(yamlText, options);
  return lint(result.budget, result, result.start, result.end);
}
