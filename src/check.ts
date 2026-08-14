/** "Is this plan any good, and if not what do I do first?"
 *
 * `lint` answers the first half. This is the other half, and it exists
 * because of a specific failure: an agent (me) rebalanced the worked
 * example seven times and got it wrong seven times, while every tool in
 * this repo reported success. The tooling described faults and never
 * described the goal, so the agent optimised against the checks instead of
 * the plan -- balanced the annual figures while the account was insolvent
 * eight weeks in, aimed at surviving to 101, and cut someone's grocery
 * budget to make the arithmetic work.
 *
 * None of that is a reasoning failure you can fix by trying harder. It's
 * missing feedforward. So this states the target, marks each part of it
 * pass or fail, and ends with one instruction -- because when several
 * things are wrong the order matters more than the list: a floor breach
 * freezes every number after it, so anything measured past one is
 * describing a plan that already stopped.
 */

import type { Budget } from "./model";
import type { RunResult } from "./simulate";
import { ageAt, type ISODate } from "./dates";
import { breaches } from "./flows";
import { lint, type Finding, type Rule } from "./lint";

export type CriterionStatus = "pass" | "fail" | "review" | "unknown";

/** Old enough that the plan did its job. Not the end of the chart: the
 * chart runs to 100 because that's the outer bound of a human life, not a
 * target. Inflation eats every retirement balance eventually and surviving
 * to the far edge needs either a fortune or spending nobody would accept,
 * so the honest bar is "well into the eighties" and the rest is the
 * person's own call. */
const OLD_ENOUGH = 80;

export interface Criterion {
  name: string;
  /** null means "couldn't be assessed yet", which is not the same as pass.
   *
   * When the cashflow fails, the run freezes its measurements there, so
   * every question after it is being asked about a plan that already
   * stopped. Reporting those as PASS is how a broken plan shows five green
   * ticks and one red -- and an agent reads five out of six as nearly
   * right, when in truth only one of them was measured at all. */
  ok: boolean | null;
  /** The explicit state for agents; `ok` remains for backwards-compatible
   * callers that only need to know whether a mechanical check failed. */
  status: CriterionStatus;
  detail: string;
  /** The finding behind a failure, so the next step is the fix for the
   * thing that actually failed. Taking the first finding off the list
   * instead produced advice for a different problem entirely: a plan whose
   * only fault was money pooling got told to go and fix super running out
   * at 86 -- which is the plan working, and was two lines above marked
   * PASS. */
  finding?: Finding;
}

export interface PlanCheck {
  start: ISODate;
  end: ISODate;
  criteria: Criterion[];
  /** Ordered by what to fix first. */
  findings: Finding[];
  reviews: Finding[];
  /** The single next thing to do, or null when it all passes. */
  next: string | null;
}

function oldest(budget: Budget, when: ISODate): number {
  let age = 0;
  for (const person of budget.birthdays) age = Math.max(age, ageAt(person.born, when));
  return age;
}

/** Accounts whose job is to be spent down to nothing eventually. When one
 * of these runs dry that's the plan reaching its end, not a fault. When a
 * clearing account or an envelope runs dry, the cashflow never worked. */
function isNestEgg(budget: Budget, name: string): boolean {
  const kind = budget.account(name).kind;
  return kind === "saving" || kind === "investment";
}

export function checkPlan(budget: Budget, result: RunResult, start: ISODate, end: ISODate): PlanCheck {
  const findings = lint(budget, result, start, end);
  const out = breaches(budget, result);
  const cashflowBreaks = out.filter((b) => !isNestEgg(budget, b.account));
  const nestEggEmpties = out.filter((b) => isNestEgg(budget, b.account));
  const has = (rule: Rule): Finding | undefined => findings.find((f) => f.rule === rule);
  const terminalGoal = budget.goals.find((goal) => goal.exit && result.completed.some(([name]) => name === goal.name));

  const criteria: Criterion[] = [];

  // First, because nothing measured after a breach is real.
  criteria.push(
    cashflowBreaks.length === 0
      ? { name: "the cashflow holds", ok: true, status: "pass", detail: "every everyday account stays above its floor" }
      : {
          name: "the cashflow holds",
          ok: false,
          status: "fail",
          detail:
            `${cashflowBreaks[0].account} runs dry ${cashflowBreaks[0].on}` +
            ` (age ${oldest(budget, cashflowBreaks[0].on)}) — the plan stops describing anything real there`,
          finding: findings.find((f) => f.rule === "account-below-floor" && f.account === cashflowBreaks[0].account),
        },
  );

  // Everything below is measured from a run that froze the day the cashflow
  // broke, so while that's failing these answers aren't answers.
  const blind = cashflowBreaks.length > 0;
  const notYet = "not assessed — fix the cashflow first";
  const settle = (finding: Finding | undefined, whenClean: string): { ok: boolean | null; status: CriterionStatus } =>
    blind ? { ok: null, status: "unknown" } :
      finding ? { ok: finding.severity === "review", status: finding.severity === "review" ? "review" : "fail" } :
      { ok: true, status: "pass" };
  const say = (finding: Finding | undefined, whenClean: string): string =>
    blind ? notYet : finding ? finding.detail : whenClean;

  const endsAt = nestEggEmpties[0];
  const terminalAt = result.endedOn;
  const terminalAge = terminalAt ? oldest(budget, terminalAt) : null;
  const endAge = endsAt ? oldest(budget, endsAt.on) : terminalAge ?? oldest(budget, end);
  criteria.push(
    blind
      ? { name: "the money lasts", ok: null, status: "unknown", detail: notYet }
      : !endsAt
        ? terminalAt
          ? endAge >= OLD_ENOUGH
            ? { name: "the money lasts", ok: true, status: "pass", detail: `${terminalGoal?.name ?? "the terminal goal"} ends the run at age ${endAge}` }
            : { name: "the money lasts", ok: false, status: "fail", detail: `${terminalGoal?.name ?? "the terminal goal"} ends the run at age ${endAge}, short of ${OLD_ENOUGH}` }
          : { name: "the money lasts", ok: true, status: "pass", detail: `nothing runs out before age ${endAge}` }
        : endAge >= OLD_ENOUGH
          ? { name: "the money lasts", ok: true, status: "pass", detail: `${endsAt.account} runs out at age ${endAge}` }
          : {
              name: "the money lasts",
              ok: false,
              status: "fail",
              detail: `${endsAt.account} runs out at age ${endAge}, short of ${OLD_ENOUGH}`,
            },
  );

  const pooling = has("clearing-account-accumulating");
  criteria.push({
    name: "nothing pools unspent",
    ...settle(pooling, ""),
    finding: pooling,
    detail: say(pooling, "clearing accounts stay flat"),
  });

  const trending = has("sinking-fund-trending");
  criteria.push({
    name: "sinking funds cycle",
    ...settle(trending, ""),
    finding: trending,
    detail: say(trending, "what fills up also empties"),
  });

  const losing = has("saving-below-inflation");
  criteria.push({
    name: "savings beat inflation",
    ...settle(losing, ""),
    finding: losing,
    detail: say(losing, "no account grows in dollars and shrinks in what it buys"),
  });

  const unfired = has("goal-never-fires");
  criteria.push({
    name: "every goal fires",
    ...settle(unfired, ""),
    finding: unfired,
    detail: say(unfired, "every goal is reached inside the run"),
  });

  const unfiredTransfer = has("transfer-never-fires");
  criteria.push({
    name: "every transfer fires",
    ...settle(unfiredTransfer, ""),
    finding: unfiredTransfer,
    detail: say(unfiredTransfer, "every transfer fires at least once inside the run"),
  });

  const early = has("super-before-preservation-age");
  criteria.push({
    name: "super stays preserved",
    ...settle(early, ""),
    finding: early,
    detail: say(early, "nothing draws super early"),
  });

  return { start, end, criteria, findings, reviews: findings.filter((f) => f.severity === "review"), next: nextStep(criteria, endsAt || terminalAt ? endAge : null) };
}

function nextStep(criteria: Criterion[], endAge: number | null): string | null {
  const failed = criteria.find((c) => c.status === "fail");
  if (!failed) return criteria.some((c) => c.ok === null) ? "something above could not be assessed" : null;

  if (failed.name === "the money lasts") {
    return (
      `The plan holds together but the money runs out at ${endAge}. Aim for the eighties.\n` +
      `    More in before retirement, or a later retirement date — not less spending. ` +
      `What someone eats is an input, not a knob.`
    );
  }

  const finding = failed.finding;
  if (!finding) return `${failed.name} — ${failed.detail}`;
  return `${finding.rule} (${finding.account})\n    ${finding.detail}.\n    ${finding.fix}`;
}

export function formatCheck(check: PlanCheck, budget: Budget): string {
  const lines: string[] = [];
  const ages = budget.birthdays.map((p) => `${p.name} ${ageAt(p.born, check.end)}`).join(", ");
  lines.push(`plan check — to ${check.end}${ages ? ` (${ages})` : ""}`);
  lines.push("");
  for (const c of check.criteria) {
    const mark = c.status === "unknown" ? "  ??" : c.status.toUpperCase();
    lines.push(`  ${mark}  ${c.name.padEnd(24)} ${c.detail}`);
  }
  lines.push("");
  if (check.next === null) {
    lines.push("  Nothing left to fix. That doesn't mean it's the right plan for them —");
    lines.push("  only that nothing in it is broken. Go and ask.");
  } else {
    lines.push(`  next: ${check.next}`);
  }
  return lines.join("\n");
}
