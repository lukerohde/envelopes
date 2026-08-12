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
import { annualise, breaches, highestOf, yearsIn } from "./flows";

export type Rule =
  | "account-below-floor"
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
  /** What to change, and what that change will cost somewhere else.
   *
   * A finding that only names the symptom leaves the reader to guess the
   * lever, and the levers here are coupled in ways nobody works out by
   * reasoning -- raising a super contribution to soak a surplus makes the
   * plan last longer, which gives the retirement drawdown more years to
   * pool, so the surplus gets *bigger*. That was discovered by thrashing.
   * It belongs here so nobody has to discover it twice. */
  fix: string;
}

/** The order to deal with findings in, and it isn't cosmetic: a floor
 * breach freezes every downstream number, so anything measured after one
 * is describing a plan that already stopped working. Fix the cashflow and
 * the rest of the list changes under you -- which is why it's first. */
const RULE_ORDER: Rule[] = [
  "account-below-floor",
  "super-before-preservation-age",
  "goal-never-fires",
  "clearing-account-accumulating",
  "sinking-fund-trending",
  "saving-below-inflation",
];

/** The age Australian super unlocks for anyone retiring now. Drawing on it
 * before this isn't a modelling error, it's money that legally isn't
 * available -- which makes a bridge fund that runs dry early the most
 * expensive mistake a plan of this shape can make. */
const PRESERVATION_AGE = 60;

/** Below this a year, a trend is just noise -- a rounding remainder or a
 * fortnight's timing at the end of the run, not money going astray. */
const NOISE_PER_YEAR = 100;

/** A clearing account is judged against what passes through it, not against
 * a flat dollar figure. $500 a year piling up is most of a student's budget
 * and a rounding error on a household turning over $130k -- one constant
 * cannot mean both. The absolute floor below is there so a tiny account
 * with almost no throughput doesn't get flagged over pennies. */
const SURPLUS_SHARE_OF_INCOME = 0.01;
const SURPLUS_FLOOR_PER_YEAR = 500;

function money(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

export function lint(budget: Budget, result: RunResult, start: ISODate, end: ISODate): Finding[] {
  const findings: Finding[] = [];
  const years = yearsIn(start, end);

  // Once an account has gone under its floor the plan has stopped working,
  // and every figure after that point is fiction -- the simulation keeps
  // paying bills out of money that isn't there. "-$3.5M by 2081" is not a
  // fact about anyone's life, it's the arithmetic carrying on past the end
  // of the story, so nothing here quotes a balance from beyond this point.
  //
  // There was a separate `account-ends-negative` rule reporting exactly that
  // closing balance. It's gone: a floor defaults to 0, so anything ending
  // negative went under its floor first, and this catches it years earlier
  // and says something truer. The floor is where the user states what "too
  // low" means -- there's no need for a second opinion.
  const broke = new Map(breaches(budget, result).map((b) => [b.account, b]));

  // Judge the plan where it still described something real.
  const closing = result.balancesAtEnd ?? result.balances;

  for (const account of budget.accounts) {
    const balance = closing[account.name];

    // Measured at the peak, not the close. A clearing account is a buffer
    // money passes through; the question is whether it ever piled up, and
    // an account that hoards income for decades and is then drained by a
    // collapse looks flat if you only compare the two ends.
    if (account.kind === "clearing") {
      const peak = highestOf(result, account.name);
      const throughput = annualise(totalFlow(result, account.name).in, years);
      // A clearing account is meant to hold a working buffer, and a month's
      // outgoings is a fair one -- pay lands fortnightly and the big bills
      // fall on one day of the month, so the balance swings by roughly that
      // much even when nothing is wrong. Only what sits above the buffer is
      // money going nowhere.
      const buffer = account.balance + throughput / 12;
      const toPeak = peak ? yearsIn(start, peak.on) : 0;
      const grew = peak ? annualise(peak.high - buffer, toPeak) : 0;
      const material = Math.max(SURPLUS_FLOOR_PER_YEAR, throughput * SURPLUS_SHARE_OF_INCOME);
      if (peak && grew > material) {
        findings.push({
          rule: "clearing-account-accumulating",
          account: account.name,
          detail:
            `builds to ${money(peak.high)} by ${peak.on}, ${money(grew)}/yr — ` +
            `${((grew / throughput) * 100).toFixed(1)}% of what passes through it, claimed by no envelope. ` +
            `It earns no interest sitting there`,
          fix:
            `Give it a job: raise an envelope to what they really spend, or move more into savings. ` +
            `Careful -- pushing it into a fund they can't reach until 60 makes the plan last longer, ` +
            `which gives any over-sized drawdown more years to pool, and the surplus grows instead. ` +
            `The real-world answer is an annual rebudget, which the schema can't express yet.`,
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
        fix:
          `Either the rate is wrong and should be corrected, or the money is in the wrong place. ` +
          `Ask them where it actually sits — an offset account against a mortgage beats a savings ` +
          `account for exactly this reason.`,
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
            ` — closes at ${money(balance)}`,
          fix:
            `Add the spending it's saving for — an \`every: year\` transfer out of it. If there ` +
            `isn't any, it isn't a sinking fund: make it \`kind: saving\` if it's building toward ` +
            `something, or \`kind: expense\` if the balance is just cumulative spend.`,
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
          fix:
            `The bridge fund has to cover the gap. Either it's too small, or the goal that starts ` +
            `the super drawdown fires on a balance alone — add wait_for_both: true alongside a ` +
            `by_age of ${PRESERVATION_AGE}, so it waits for the money to run out AND the birthday.`,
        });
      }
    }
  }

  // An account can balance over a year and still be insolvent in the middle
  // of every month -- fortnightly pay against a big payment on the 5th --
  // and every closing-balance check above would call that fine. The chart
  // has always drawn it; this is the same finding, from the same numbers.
  for (const breach of broke.values()) {
    // Only worth quoting the low point if the account came back -- a dip and
    // a recovery is a cashflow timing problem. One that never recovers is
    // the plan ending, and its "low" is just the horizon.
    const recovered = result.balances[breach.account] >= breach.floor;
    findings.push({
      rule: "account-below-floor",
      account: breach.account,
      detail:
        `falls under its floor of ${money(breach.floor)} on ${breach.on}` +
        (recovered
          ? `, down to ${money(breach.low)}, before recovering — the money isn't there on the day it's needed`
          : ` and doesn't recover — that's where the plan runs out`),
      fix: recovered
        ? `A timing problem, not a shortfall: the money arrives after it's needed. Move a big monthly ` +
          `transfer to a different day, or raise the account's opening balance to carry the gap.`
        : `Everything measured after this date is the arithmetic carrying on without the money, so fix ` +
          `this before anything else on the list. Either less leaves the account, or more arrives.`,
    });
  }

  const fired = new Set(result.completed.map(([name]) => name));
  for (const goal of budget.goals) {
    if (fired.has(goal.name)) continue;
    findings.push({
      rule: "goal-never-fires",
      account: goal.name,
      detail: `never reached by ${end} — everything it was going to change never happens`,
      fix:
        `Check the trigger. A balance target reads its direction from the account's *opening* ` +
        `balance, so a fund that starts at 0 can't say "back to 0" — that reads as "at or above 0", ` +
        `true on day one. If the plan collapsed earlier, fix that first; goals after the collapse ` +
        `never get the chance to fire.`,
    });
  }

  findings.sort((a, b) => RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule));
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
