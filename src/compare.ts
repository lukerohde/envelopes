/** Deterministic before/after facts for the agent and the browser.
 *
 * This deliberately has no score or winner. Earlier retirement, a paid-off
 * home, accessible cash and a longer-funded retirement are different things
 * a person may value. The comparator only reports what the real engine did. */

import type { Budget } from "./model";
import { daysBetween, type ISODate } from "./dates";
import { breaches, lowestOf, surplusOf } from "./flows";
import type { RunResult } from "./simulate";

export interface PlanOutcome {
  budget: Budget;
  result: RunResult;
  start: ISODate;
  end: ISODate;
}

export type Movement = "earlier" | "later" | "unchanged" | "new" | "not-reached" | "unavailable";

export interface MilestoneComparison {
  name: string;
  fixed: boolean;
  before: ISODate | null;
  after: ISODate | null;
  /** Calendar days, after minus before. Negative means earlier. Null when a
   * date is unavailable or the milestone was not reached in one run. */
  days: number | null;
  direction: Movement;
}

export interface DateComparison {
  before: ISODate | null;
  after: ISODate | null;
  days: number | null;
  direction: Movement;
}

export interface ClearingMarginComparison {
  account: string;
  before: number;
  after: number;
  change: number;
}

export interface PhaseSurplusComparison {
  phase: string;
  before: number;
  after: number;
  change: number;
}

export interface OutcomeComparison {
  milestones: MilestoneComparison[];
  firstFloorBreach: DateComparison;
  retirementExhaustion: DateComparison & { account: string | null };
  clearingMargins: ClearingMarginComparison[];
  surplusByPhase: PhaseSurplusComparison[];
}

function firstCompletion(outcome: PlanOutcome): Map<string, ISODate> {
  const dates = new Map<string, ISODate>();
  for (const [name, date] of outcome.result.completed) if (!dates.has(name)) dates.set(name, date);
  return dates;
}

function firstBreach(outcome: PlanOutcome): { account: string; on: ISODate } | null {
  const all = breaches(outcome.budget, outcome.result);
  return all.length === 0 ? null : { account: all[0].account, on: all[0].on };
}

function retirementBreach(outcome: PlanOutcome): { account: string; on: ISODate } | null {
  for (const breach of breaches(outcome.budget, outcome.result)) {
    const kind = outcome.budget.account(breach.account).kind;
    if (kind === "saving" || kind === "investment") return { account: breach.account, on: breach.on };
  }
  return null;
}

function usable(date: ISODate | null, outcome: PlanOutcome): boolean {
  if (!date) return false;
  const breach = firstBreach(outcome);
  return breach === null || date <= breach.on;
}

function movement(before: ISODate | null, after: ISODate | null): { days: number | null; direction: Movement } {
  if (before && after) {
    const days = daysBetween(before, after);
    return { days, direction: days < 0 ? "earlier" : days > 0 ? "later" : "unchanged" };
  }
  if (!before && after) return { days: null, direction: "new" };
  if (before && !after) return { days: null, direction: "not-reached" };
  return { days: null, direction: "not-reached" };
}

function dateComparison(before: { on: ISODate } | null, after: { on: ISODate } | null): DateComparison {
  const result = movement(before?.on ?? null, after?.on ?? null);
  return { before: before?.on ?? null, after: after?.on ?? null, ...result };
}

function allGoalNames(before: PlanOutcome, after: PlanOutcome): string[] {
  const names: string[] = [];
  for (const goal of before.budget.goals) if (!names.includes(goal.name)) names.push(goal.name);
  for (const goal of after.budget.goals) if (!names.includes(goal.name)) names.push(goal.name);
  return names.sort();
}

export function compareOutcomes(before: PlanOutcome, after: PlanOutcome): OutcomeComparison {
  const beforeDates = firstCompletion(before);
  const afterDates = firstCompletion(after);
  const milestones: MilestoneComparison[] = [];
  for (const name of allGoalNames(before, after)) {
    const beforeGoal = before.budget.goals.find((goal) => goal.name === name);
    const afterGoal = after.budget.goals.find((goal) => goal.name === name);
    const fixed = (beforeGoal?.by !== null && beforeGoal?.by !== undefined) || (afterGoal?.by !== null && afterGoal?.by !== undefined);
    const beforeDate = usable(beforeDates.get(name) ?? null, before) ? beforeDates.get(name) ?? null : null;
    const afterDate = usable(afterDates.get(name) ?? null, after) ? afterDates.get(name) ?? null : null;
    const result = movement(beforeDate, afterDate);
    milestones.push({ name, fixed, before: beforeDate, after: afterDate, ...result });
  }

  const beforeRetirement = retirementBreach(before);
  const afterRetirement = retirementBreach(after);
  const retirement = dateComparison(beforeRetirement, afterRetirement) as DateComparison & { account: string | null };
  retirement.account = afterRetirement?.account ?? beforeRetirement?.account ?? null;

  const clearingMargins: ClearingMarginComparison[] = [];
  const names: string[] = [];
  for (const account of before.budget.accounts) if (account.kind === "clearing") names.push(account.name);
  for (const account of after.budget.accounts) if (account.kind === "clearing" && !names.includes(account.name)) names.push(account.name);
  for (const name of names) {
    const beforeAccount = before.budget.accounts.find((account) => account.name === name);
    const afterAccount = after.budget.accounts.find((account) => account.name === name);
    const beforeLow = beforeAccount && lowestOf(before.result, name);
    const afterLow = afterAccount && lowestOf(after.result, name);
    const beforeMargin = beforeLow ? beforeLow.low - beforeAccount!.floor : 0;
    const afterMargin = afterLow ? afterLow.low - afterAccount!.floor : 0;
    clearingMargins.push({ account: name, before: beforeMargin, after: afterMargin, change: afterMargin - beforeMargin });
  }

  const surplusByPhase: PhaseSurplusComparison[] = [];
  const phaseCount = Math.max(before.result.phases.length, after.result.phases.length);
  for (let i = 0; i < phaseCount; i++) {
    const beforePhase = before.result.phases[i];
    const afterPhase = after.result.phases[i];
    const beforeSurplus = beforePhase ? surplusOf(beforePhase, before.budget) : 0;
    const afterSurplus = afterPhase ? surplusOf(afterPhase, after.budget) : 0;
    surplusByPhase.push({
      phase: afterPhase?.name ?? beforePhase?.name ?? `phase ${i + 1}`,
      before: beforeSurplus,
      after: afterSurplus,
      change: afterSurplus - beforeSurplus,
    });
  }

  return {
    milestones,
    firstFloorBreach: dateComparison(firstBreach(before), firstBreach(after)),
    retirementExhaustion: retirement,
    clearingMargins,
    surplusByPhase,
  };
}

function daysText(days: number): string {
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
}

/** One short, neutral line for a committed UI edit. */
export function formatImpact(comparison: OutcomeComparison): string {
  const changed: string[] = [];
  for (const milestone of comparison.milestones) {
    if (milestone.direction === "earlier" || milestone.direction === "later") {
      changed.push(`${milestone.name} ${daysText(milestone.days!)} ${milestone.direction}`);
    } else if (milestone.direction === "new") {
      changed.push(`${milestone.name} reached`);
    } else if (milestone.direction === "not-reached") {
      changed.push(`${milestone.name} not reached`);
    }
  }
  if (changed.length > 0) return changed.slice(0, 3).join(" · ");
  const surplus = comparison.surplusByPhase.find((phase) => Math.abs(phase.change) > 0.5);
  if (surplus) return `No named milestone moved — ${surplus.change > 0 ? "more" : "less"} cash is unallocated in ${surplus.phase}`;
  return "No named milestone moved";
}
