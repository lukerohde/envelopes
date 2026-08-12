/** Turning the raw per-phase totals the run collected into the numbers a
 * person actually reasons with.
 *
 * The case for this existing at all: reconciling a pay account by hand
 * across four different cadences -- weekly groceries, fortnightly cards,
 * monthly direct debits, yearly insurances -- turned out to be the most
 * informative thing anyone did to a plan. When what goes out agrees with
 * what comes in to within a few cents, the plan was calibrated rather than
 * guessed. Nothing in the tool could show that, so it took paper.
 *
 * Everything here is annualised, because that's what makes a weekly figure
 * and a monthly one comparable without doing the conversion in your head.
 */

import type { AccountFlow, Phase, RunResult } from "./simulate";
import type { Budget } from "./model";
import { deflate } from "./report";
import type { ISODate } from "./dates";

export function yearsIn(start: ISODate, end: ISODate): number {
  return (Date.parse(end) - Date.parse(start)) / (365.25 * 24 * 60 * 60 * 1000);
}

/** A phase total as a per-year rate. A phase with no length has no rate --
 * zero rather than an Infinity that would poison every table it touched. */
export function annualise(total: number, years: number): number {
  return years <= 0 ? 0 : total / years;
}

/** How long this balance lasts at this year's burn rate. The question the
 * bridge fund exists to answer: does it reach preservation age. */
export function coverYears(balance: number, annualOut: number): number {
  if (balance <= 0) return 0;
  if (annualOut <= 0) return Infinity;
  return balance / annualOut;
}

/** What the row says the closing balance should be, given everything that
 * moved. Money arriving at a debt pays it down, so the sign flips -- see
 * AccountFlow.debt for why `in` stays gross either way. */
export function expectedClosing(flow: AccountFlow): number {
  const net = flow.debt ? flow.out - flow.in : flow.in - flow.out;
  return flow.opening + net + flow.interest;
}

/** Income that no envelope ever claimed. Clearing accounts are the ones
 * that shouldn't trend -- pay lands there and is meant to leave again -- so
 * whatever they kept over a phase is surplus going nowhere in particular. */
export function surplusOf(phase: Phase, budget: Budget): number {
  let total = 0;
  for (const account of budget.accounts) {
    if (account.kind !== "clearing") continue;
    const flow = phase.accounts[account.name];
    total += flow.in - flow.out + flow.interest;
  }
  return total;
}

/** The lowest an account reached across the whole run, and when.
 *
 * The run records this per phase as it walks; this just takes the worst of
 * them. One place answers the question, because three things need the same
 * answer and they must not disagree: the linter names it, the chart marks
 * it, and the timeline stops there. */
export function lowestOf(result: RunResult, account: string): { low: number; on: ISODate } | null {
  let worst: { low: number; on: ISODate } | null = null;
  for (const phase of result.phases) {
    const flow = phase.accounts[account];
    if (!flow) continue;
    if (!worst || flow.low < worst.low) worst = { low: flow.low, on: flow.lowOn };
  }
  return worst;
}

export interface Breach {
  account: string;
  /** When it first went under -- where the plan stopped working. */
  on: ISODate;
  /** How bad it got, and when. Often much later than `on`. */
  low: number;
  lowOn: ISODate;
  floor: number;
}

/** Every account that dips under its own floor, earliest first.
 *
 * Strictly below, not at-or-below: sitting exactly on a $0 floor is a normal
 * resting state for a pure ledger account, and a mortgage paid off to
 * exactly zero is success. A loan is skipped outright -- starting high and
 * being paid down is the whole point of one. */
export function breaches(budget: Budget, result: RunResult): Breach[] {
  const found: Breach[] = [];
  for (const account of budget.accounts) {
    if (account.kind === "loan") continue;
    let first: ISODate | null = null;
    for (const phase of result.phases) {
      const on = phase.accounts[account.name]?.breachedOn;
      if (on && (first === null || on < first)) first = on;
    }
    if (first === null) continue;
    const worst = lowestOf(result, account.name)!;
    found.push({ account: account.name, on: first, low: worst.low, lowOn: worst.on, floor: account.floor });
  }
  found.sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0));
  return found;
}

export interface FlowRow {
  account: string;
  inPerYear: number;
  outPerYear: number;
  /** Interest earned or charged. Shown because on a mortgage or a super
   * balance it's the biggest number in the row, and without it the columns
   * can't explain the balance sitting next to them. */
  interestPerYear: number;
  netPerYear: number;
  closing: number;
  /** Infinity where nothing is being drawn down; NaN where the question is
   * meaningless -- an expense envelope never "runs out", it isn't a pot. */
  cover: number;
}

export interface PhaseSummary {
  name: string;
  start: ISODate;
  end: ISODate;
  years: number;
  surplusPerYear: number;
  rows: FlowRow[];
}

/** `real` deflates the flows to today's money using the phase midpoint --
 * a phase spans years, so its midpoint is the honest single point to
 * discount a steady stream back from. Balances stay nominal: that's the
 * number the bank will actually say. */
export function summarise(phases: Phase[], budget: Budget, start: ISODate, real: boolean): PhaseSummary[] {
  const summaries: PhaseSummary[] = [];
  for (const phase of phases) {
    const years = yearsIn(phase.start, phase.end);
    const midpoint = yearsIn(start, phase.start) + years / 2;
    const toToday = (amount: number): number => (real ? deflate(amount, budget.inflation, midpoint) : amount);

    const rows: FlowRow[] = [];
    for (const account of budget.accounts) {
      const flow = phase.accounts[account.name];
      const inPerYear = toToday(annualise(flow.in, years));
      const outPerYear = toToday(annualise(flow.out, years));
      const interestPerYear = toToday(annualise(flow.interest, years));
      if (inPerYear === 0 && outPerYear === 0 && flow.closing === 0) continue;

      // "How long does this last" only means something for a pot you draw
      // down. An expense envelope isn't a pot -- its balance is a running
      // total of spend -- and a loan runs out by being paid off, which the
      // milestones already say.
      const drawable = account.kind !== "expense" && account.kind !== "loan";

      rows.push({
        account: account.name,
        inPerYear,
        outPerYear,
        interestPerYear,
        netPerYear: (flow.debt ? outPerYear - inPerYear : inPerYear - outPerYear) + interestPerYear,
        closing: flow.closing,
        cover: drawable ? coverYears(flow.closing, annualise(flow.out, years)) : NaN,
      });
    }

    summaries.push({
      name: phase.name,
      start: phase.start,
      end: phase.end,
      years,
      surplusPerYear: toToday(annualise(surplusOf(phase, budget), years)),
      rows,
    });
  }
  return summaries;
}

function money(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function cover(years: number): string {
  if (Number.isNaN(years)) return "";
  if (years === Infinity) return "never empties";
  if (years === 0) return "-";
  return `${years.toFixed(1)}y`;
}

export function formatFlows(summaries: PhaseSummary[], real: boolean): string {
  const lines: string[] = [];
  lines.push(`annual flows by phase${real ? ", in today's dollars" : ""}:`);
  lines.push("  net is in + interest - out (flipped for debt), so opening + net x years == closing.");

  for (const phase of summaries) {
    lines.push("");
    lines.push(`  ${phase.name}  (${phase.start} to ${phase.end}, ${phase.years.toFixed(1)}y)`);
    lines.push(
      `    ${"account".padEnd(22)}${"in/yr".padStart(11)}${"out/yr".padStart(11)}` +
        `${"interest/yr".padStart(13)}${"net/yr".padStart(11)}${"closing".padStart(14)}${"  cover"}`,
    );
    for (const row of phase.rows) {
      lines.push(
        `    ${row.account.padEnd(22)}${money(row.inPerYear).padStart(11)}${money(row.outPerYear).padStart(11)}` +
          `${money(row.interestPerYear).padStart(13)}${money(row.netPerYear).padStart(11)}` +
          `${money(row.closing).padStart(14)}  ${cover(row.cover)}`,
      );
    }
    lines.push(`    ${"unallocated surplus".padEnd(22)}${money(phase.surplusPerYear).padStart(11)} /yr`);
  }

  return lines.join("\n");
}
