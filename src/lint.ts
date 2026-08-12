/** Named findings, instead of a table someone has to interpret.
 *
 * Every rule below fired on a real plan while nothing said a word: a super
 * account finishing deep in the red, a pay account quietly banking years of
 * unallocated surplus, and a sinking fund taking money in for forty years
 * and never paying any out. All three are visible in the --flows table if
 * you know what to look for, which is the problem -- an agent reading
 * somebody's plan for them doesn't.
 *
 * Everything here reads what the run already collected. No second
 * traversal, and every finding can be checked against the flow row it came
 * from, which matters: a linter you can't verify gets ignored.
 */

import type { Budget } from "./model";
import type { RunResult } from "./simulate";
import { ageAt, type ISODate } from "./dates";
import { annualise, yearsIn } from "./flows";

export type Rule =
  | "account-ends-negative"
  | "clearing-account-accumulating"
  | "saving-below-inflation"
  | "sinking-fund-trending"
  | "goal-never-fires"
  | "super-before-preservation-age";

export interface Finding {
  rule: Rule;
  /** The account or goal the finding is about, so a caller can point at it. */
  account: string;
  /** One line a person can act on. Numbers, not adjectives. */
  detail: string;
}

/** The age Australian super unlocks for anyone retiring now. Drawing on it
 * before this isn't a modelling error, it's money that legally isn't
 * available -- which makes a bridge fund that runs dry early the most
 * expensive mistake a plan of this shape can make. */
const PRESERVATION_AGE = 60;

/** Below this a year, a trend is just noise -- a rounding remainder or a
 * fortnight's timing at the end of the run, not money going astray. */
const NOISE_PER_YEAR = 100;

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function lint(budget: Budget, result: RunResult, start: ISODate, end: ISODate): Finding[] {
  const findings: Finding[] = [];
  const years = yearsIn(start, end);

  for (const account of budget.accounts) {
    const balance = result.balances[account.name];

    // A loan is *supposed* to end at or below zero -- that's it being paid
    // off -- and an expense envelope's balance is cumulative spend, which
    // can't meaningfully go negative anyway.
    if (account.kind !== "loan" && balance < 0) {
      findings.push({
        rule: "account-ends-negative",
        account: account.name,
        detail: `closes at ${money(balance)} — it runs out before the plan does`,
      });
    }

    if (account.kind === "clearing") {
      const grew = annualise(balance - account.balance, years);
      if (grew > NOISE_PER_YEAR) {
        findings.push({
          rule: "clearing-account-accumulating",
          account: account.name,
          detail: `gains ${money(grew)}/yr and closes at ${money(balance)} — income no envelope claimed`,
        });
      }
    }

    if (account.kind === "saving" && account.rate < budget.inflation && balance > account.balance) {
      findings.push({
        rule: "saving-below-inflation",
        account: account.name,
        detail:
          `earns ${(account.rate * 100).toFixed(1)}% against ${(budget.inflation * 100).toFixed(1)}% inflation` +
          ` — it grows in dollars and shrinks in what it buys`,
      });
    }

    // A sinking fund is defined by emptying again. One that only ever fills
    // is either mislabelled or missing the spending it was saving for.
    if (account.kind === "sinking") {
      const totals = totalFlow(result, account.name);
      const trend = annualise(balance - account.balance, years);
      if (totals.out === 0 && trend > NOISE_PER_YEAR) {
        findings.push({
          rule: "sinking-fund-trending",
          account: account.name,
          detail:
            `takes ${money(annualise(totals.in, years))}/yr in and pays nothing out, ever` +
            ` — closes at ${money(balance)}. Model what it's saved for.`,
        });
      }
    }

    if (account.kind === "investment") {
      const drawnAt = firstDrawdown(result, account.name, start);
      const owner = ownerOf(budget, account.name);
      if (drawnAt && owner && ageAt(owner.born, drawnAt) < PRESERVATION_AGE) {
        findings.push({
          rule: "super-before-preservation-age",
          account: account.name,
          detail:
            `first drawn ${drawnAt}, when ${owner.name} is ${ageAt(owner.born, drawnAt)}` +
            ` — super is preserved until ${PRESERVATION_AGE}`,
        });
      }
    }
  }

  const fired = new Set(result.completed.map(([name]) => name));
  for (const goal of budget.goals) {
    if (fired.has(goal.name)) continue;
    findings.push({
      rule: "goal-never-fires",
      account: goal.name,
      detail: `never reached by ${end} — everything it was going to change never happens`,
    });
  }

  return findings;
}

function totalFlow(result: RunResult, account: string): { in: number; out: number } {
  let inTotal = 0;
  let outTotal = 0;
  for (const phase of result.phases) {
    const flow = phase.accounts[account];
    if (!flow) continue;
    inTotal += flow.in;
    outTotal += flow.out;
  }
  return { in: inTotal, out: outTotal };
}

/** The first phase in which anything was drawn out of this account, dated
 * to that phase's start. Phase-level rather than day-level because that's
 * the resolution the run keeps -- close enough to catch a bridge fund
 * running dry years early, which is the failure this is for. */
function firstDrawdown(result: RunResult, account: string, start: ISODate): ISODate | null {
  for (const phase of result.phases) {
    const flow = phase.accounts[account];
    // `drawn`, not `out` -- fees and contributions tax leave a super
    // account every month from day one and are not somebody raiding it.
    if (flow && flow.drawn > 0) return phase.start === start ? start : phase.start;
  }
  return null;
}

/** Whose account this is, by name. "super alex" belongs to alex -- the same
 * convention the model already relies on instead of a `who` field. */
function ownerOf(budget: Budget, account: string) {
  const lowered = account.toLowerCase();
  for (const person of budget.birthdays) {
    if (lowered.includes(person.name.toLowerCase())) return person;
  }
  return budget.birthdays.length === 1 ? budget.birthdays[0] : null;
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "no findings — nothing here trips a rule";
  const lines: string[] = [`${findings.length} finding${findings.length === 1 ? "" : "s"}:`];
  for (const finding of findings) {
    lines.push("");
    lines.push(`  ${finding.rule}  (${finding.account})`);
    lines.push(`    ${finding.detail}`);
  }
  return lines.join("\n");
}
