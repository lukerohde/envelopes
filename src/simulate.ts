/** Walks every account forward together, day by day: interest compounds and
 * transfers fire literally, as configured. The one thing a plain transfer
 * can't do on its own is what happens when a goal completes -- that's an
 * event, and a goal reaching its target (by date or by amount) is always
 * the trigger.
 *
 * The event's consequence is a set of overrides, matched to existing
 * transfers by name. A name that already exists gets its fields replaced;
 * a name that doesn't is added as a new transfer from then on. Zeroing an
 * amount stops it, changing `into` redirects it, a brand new name starts
 * something new -- one mechanism, no special-casing per kind of change.
 *
 * Goals are independent events, each checked every day -- ported straight
 * from fridge/simulate.py, see that file's own docstring for the reasoning.
 * An explicit `exit` goal is the one exception to the ordinary walk: it marks
 * an intentional terminal boundary and stops on the day it completes.
 */

import type { Budget, Goal, Transfer } from "./model";
import { daysBetween, type ISODate } from "./dates";
import { fires } from "./schedule";

type Balances = Record<string, number>;
type Rates = Record<string, number>;
export type History = Record<string, [ISODate, number][]>;

/** What happened to one account over one phase. Interest is separate from
 * the transfers so the row actually reconciles:
 *
 *     opening + in - out + interest == closing
 *
 * A table of flows that doesn't add up to the balance beside it is worse
 * than no table -- you'd spend an afternoon looking for the missing money
 * and the answer would be "compounding". */
export interface AccountFlow {
  opening: number;
  in: number;
  out: number;
  /** The part of `out` that landed in another account, rather than leaving
   * the system. A super drawdown lands in the pay account; super fees and
   * contributions tax just go. Both are outflows, but only the first is
   * someone *taking money out* -- and a rule that can't tell them apart
   * accuses every plan of raiding its super on day one. */
  drawn: number;
  interest: number;
  closing: number;
  /** The lowest this account got during the phase, and when. Kept as two
   * numbers rather than a history because the question "did this ever dip
   * below its floor" needs every day, and keeping every day for every
   * account is 14,600 rows apiece. An account can balance over a year and
   * still be insolvent in the middle of every month -- that gap is how a
   * plan passes every closing-balance check and still fails on the page. */
  low: number;
  lowOn: ISODate;
  /** And the highest, which is what catches money piling up somewhere it
   * shouldn't. Opening-versus-closing can't: an account that hoards income
   * for forty years and is then drained in a collapse looks, on those two
   * numbers alone, like it shrank. */
  high: number;
  highOn: ISODate;
  /** The *first* day the balance went under the account's floor, which is a
   * different question to where it got worst -- a plan can slide under in
   * 2069 and bottom out in 2081. The first date is where the plan stopped
   * working, so it's what the chart stops at and what a finding leads with;
   * the low is how bad it got. Null if it never breached. */
  breachedOn: ISODate | null;
  /** Whether the run treated arriving money as paying this down rather than
   * building it up. `in` is always gross cashflow -- a $500 mortgage payment
   * is $500 arriving, however the balance then moves -- so without this flag
   * the row wouldn't reconcile, and worse, it'd reconcile *wrongly* for
   * exactly one kind of account. Read from the same debt set the simulation
   * used, not from `kind`: a loan nothing has a goal against isn't treated
   * as one (see debtAccounts). */
  debt: boolean;
}

/** A stretch of the run between goal completions. The goals already cut a
 * plan into regimes -- working, post-mortgage, bridge, super -- and those
 * are the only boundaries where the flows actually change shape. Averaging
 * across all of them describes none of them. */
export interface Phase {
  name: string;
  start: ISODate;
  end: ISODate;
  accounts: Record<string, AccountFlow>;
}

export interface RunResult {
  balances: Balances;
  completed: [string, ISODate][];
  history: History;
  phases: Phase[];
  /** Balances as at the day the plan first went under a floor -- the last
   * day it described something real. Null when nothing ever breached, in
   * which case the horizon is the end. Judge a plan on these. */
  balancesAtEnd: Balances | null;
  /** The day an explicit terminal goal completed, if the run stopped there. */
  endedOn: ISODate | null;
  /** Names of every transfer that was active at some point during the run
   * but never actually fired -- a `once` dated in the past, past the
   * horizon, or on a schedule that never came round. By name, not by
   * transfer object: a goal override that replaces a transfer keeps the
   * same name, and that name has already moved money under an earlier
   * object, so it isn't "never fired". */
  neverFired: string[];
}

/** `track` names which accounts to record a daily history for -- pass none
 * and history stays empty at no extra cost. Every caller gets the same
 * three things back; take what you need. */
export function run(budget: Budget, start: ISODate, end: ISODate, track: string[] = []): RunResult {
  const balances: Balances = {};
  const rates: Rates = {};
  for (const account of budget.accounts) {
    balances[account.name] = account.balance;
    rates[account.name] = account.rate;
  }
  const offsetBy = offsettersOf(budget);

  const debts = debtAccounts(budget);
  const loans = new Set(budget.accounts.filter((account) => account.kind === "loan").map((account) => account.name));
  const stopped = new Set<Transfer>();
  const active = [...budget.transfers];
  const fired = new Set<string>();
  let pending = [...budget.goals];
  const completed: [string, ISODate][] = [];
  // Goals whose balance condition was already satisfied at the last check.
  // Only used to decide whether snapping is safe -- see checkGoals.
  const alreadyAtTarget = new Set<Goal>();
  const history: History = {};
  for (const name of track) history[name] = [];

  const floors: Record<string, number> = {};
  for (const account of budget.accounts) floors[account.name] = account.floor;
  const ledger = new Ledger(start, balances, debts, floors);
  let balancesAtEnd: Balances | null = null;
  let endedOn: ISODate | null = null;

  let when = start;
  while (when < end) {
    grow(balances, rates, offsetBy, ledger);
    applyTransfers(active, balances, debts, loans, stopped, when, start, ledger, fired);
    if (pending.length > 0) {
      const before = completed.length;
      const checked = checkGoals(budget, balances, rates, pending, completed, active, stopped, when, alreadyAtTarget);
      pending = checked.pending;
      // A goal firing is what ends a phase. Several can land on the same
      // day, so this closes once and names them together rather than
      // leaving a run of zero-length phases in the table.
      if (completed.length > before) {
        ledger.closePhase(when, completed.slice(before).map(([name]) => name), balances, checked.exit);
      }
      if (checked.exit) {
        endedOn = when;
        for (const name of track) history[name].push([when, balances[name]]);
        break;
      }
    }
    // The walk carries on past a floor breach, because the chart draws that
    // stretch and it's honest about how the hole deepens. What stops is the
    // *measuring*: once an account is under its floor the plan has stopped
    // describing anyone's life, and everything after is bills paid out of
    // money that isn't there.
    //
    // Three separate rules were quietly reading numbers from beyond that
    // point -- one reported -$3.5M as a closing balance, one missed a $297k
    // leak because the later collapse made it look like shrinkage, and one
    // found a pay account's "peak" forty years after the money ran out.
    // Freezing the statistics here fixes all three at once, rather than each
    // rule remembering to check. Ending the run outright would too, but it
    // would also kill a plan that dips under a floor for three days a month
    // and recovers, which is a timing problem and not a collapse.
    if (ledger.recordLows(balances, when) && balancesAtEnd === null) {
      balancesAtEnd = { ...balances };
      ledger.stop(when, balancesAtEnd);
    }
    for (const name of track) history[name].push([when, balances[name]]);
    when = addDays(when, 1);
  }

  const activeNames = new Set(active.map((transfer) => transfer.name));
  const neverFired = [...activeNames].filter((name) => !fired.has(name));

  return { balances, completed, history, phases: ledger.finish(endedOn ?? end, balances), balancesAtEnd, endedOn, neverFired };
}

/** Accumulates the in/out/interest totals as the run walks, one bucket per
 * phase. Kept as a class only because it owns a running "current phase"
 * that four separate call sites write into; there's no cleverness in it. */
class Ledger {
  private done: Phase[] = [];
  private current: Phase;

  constructor(start: ISODate, balances: Balances, private debts: Set<string>, private floors: Record<string, number>) {
    this.current = openPhase("from the start", start, balances, debts);
  }

  record(account: string, field: "in" | "out" | "drawn" | "interest", amount: number): void {
    if (this.stopped) return;
    this.current.accounts[account][field] += amount;
  }

  /** Once a day, after everything has moved. Two comparisons per account --
   * cheap enough to always be on, which matters because the failure it
   * catches is invisible to every other number here.
   *
   * Returns true on the first day any account goes under its floor, so the
   * caller can snapshot what the world looked like while it still made
   * sense. */
  recordLows(balances: Balances, when: ISODate): boolean {
    if (this.stopped) return false;
    let brokeToday = false;
    for (const [name, flow] of Object.entries(this.current.accounts)) {
      // frozen once the plan has broken -- see the note at the call site
      if (this.everBroke) break;
      if (balances[name] < flow.low) {
        flow.low = balances[name];
        flow.lowOn = when;
      }
      if (balances[name] > flow.high) {
        flow.high = balances[name];
        flow.highOn = when;
      }
      // strictly below, not at-or-below -- sitting exactly on a $0 floor is
      // a normal resting state for a pure ledger account, and a mortgage
      // paid off to exactly zero is success, not a breach
      if (flow.breachedOn === null && balances[name] < this.floors[name] && !this.debts.has(name)) {
        flow.breachedOn = when;
        if (!this.everBroke) {
          this.everBroke = true;
          brokeToday = true;
        }
      }
    }
    return brokeToday;
  }

  private everBroke = false;
  private stopped = false;

  /** Freeze flow measurement at the first breach. The day itself has already
   * been fully recorded; later chart samples may continue, but they must not
   * accrue transfers or negative interest into the flow table. */
  stop(when: ISODate, balances: Balances): void {
    if (this.stopped) return;
    this.stopped = true;
    this.seal(when, balances);
  }

  closePhase(when: ISODate, goalNames: string[], balances: Balances, terminal = false): void {
    if (this.stopped) return;
    // A terminal goal has no next phase to receive today's low/high sample.
    // Record it before sealing so the final flow table describes the actual
    // terminal balance as well as its closing figure.
    if (terminal) this.recordLows(balances, when);
    this.seal(when, balances);
    if (terminal) {
      this.stopped = true;
      return;
    }
    this.current = openPhase(`after ${goalNames.join(" + ")}`, when, balances, this.debts);
  }

  finish(end: ISODate, balances: Balances): Phase[] {
    if (this.stopped) return this.done;
    this.seal(end, balances);
    return this.done;
  }

  private seal(end: ISODate, balances: Balances): void {
    this.current.end = end;
    for (const [name, flow] of Object.entries(this.current.accounts)) flow.closing = balances[name];
    this.done.push(this.current);
  }
}

function openPhase(name: string, start: ISODate, balances: Balances, debts: Set<string>): Phase {
  const accounts: Record<string, AccountFlow> = {};
  for (const account of Object.keys(balances)) {
    accounts[account] = {
      opening: balances[account],
      in: 0,
      out: 0,
      drawn: 0,
      interest: 0,
      closing: 0,
      low: balances[account],
      lowOn: start,
      high: balances[account],
      highOn: start,
      breachedOn: null,
      debt: debts.has(account),
    };
  }
  return { name, start, end: start, accounts };
}

function addDays(d: ISODate, n: number): ISODate {
  // local, tiny -- avoids a circular-feeling extra import for one call site
  const [y, m, day] = d.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, day + n));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Accounts a goal is paying down, rather than filling up -- arriving money
 * shrinks these; everywhere else, arriving money just adds up. Only an
 * explicit `kind: loan` counts -- a by-date or by-age goal's `account`
 * field is otherwise unused (see model.ts), and it must never turn
 * whatever account it happens to point at into a debt by accident. */
function debtAccounts(budget: Budget): Set<string> {
  const names = new Set<string>();
  for (const goal of budget.goals) {
    if (goal.account !== null && budget.account(goal.account).kind === "loan") names.add(goal.account);
  }
  return names;
}

/** Maps a loan's name to the names of every saving account that offsets
 * it -- built once per run, not recomputed every day. */
function offsettersOf(budget: Budget): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const account of budget.accounts) {
    if (!account.offsets) continue;
    const existing = map.get(account.offsets) ?? [];
    existing.push(account.name);
    map.set(account.offsets, existing);
  }
  return map;
}

/** Ordinary daily compounding, except a loan only earns interest on the
 * part an offset account hasn't already covered -- never less than zero,
 * an offset can erase a loan's interest but never pay you to hold it. */
function grow(balances: Balances, rates: Rates, offsetBy: Map<string, string[]>, ledger: Ledger): void {
  for (const name of Object.keys(balances)) {
    const principal = effectivePrincipal(name, balances, offsetBy);
    const earned = (principal * rates[name]) / 365.25;
    balances[name] += earned;
    if (earned !== 0) ledger.record(name, "interest", earned);
  }
}

function effectivePrincipal(name: string, balances: Balances, offsetBy: Map<string, string[]>): number {
  const offsetters = offsetBy.get(name);
  if (!offsetters) return balances[name];
  let offsetTotal = 0;
  for (const offsetter of offsetters) offsetTotal += balances[offsetter];
  return Math.max(0, balances[name] - offsetTotal);
}

function applyTransfers(
  active: Transfer[],
  balances: Balances,
  debts: Set<string>,
  loans: Set<string>,
  stopped: Set<Transfer>,
  when: ISODate,
  start: ISODate,
  ledger: Ledger,
  fired: Set<string>,
): void {
  for (const transfer of active) {
    if (stopped.has(transfer)) continue;
    if (!fires(transfer.every, transfer.day as string | number, when)) continue;
    fired.add(transfer.name);
    const amount = transfer.sweepAbove === undefined
      ? escalated(transfer, when, start)
      : sweptAmount(transfer, balances, loans, when, start);
    if (transfer.outOf) {
      balances[transfer.outOf] -= amount;
      ledger.record(transfer.outOf, "out", amount);
      if (transfer.into) ledger.record(transfer.outOf, "drawn", amount);
    }
    if (transfer.into) {
      balances[transfer.into] += arrivingAmount(transfer.into, amount, debts, loans);
      // The gross amount, not the signed one. A $500 mortgage payment is
      // $500 of cashflow arriving at the loan; that it shrinks the balance
      // rather than growing it is the debt convention, not the flow.
      ledger.record(transfer.into, "in", amount);
    }
  }
}

/** A pay rise on income, inflation on spending -- compounding annually from
 * the day the simulation starts, same reference point for every transfer
 * whether it was there from day one or added later by an override. */
function escalated(transfer: Transfer, when: ISODate, start: ISODate): number {
  if (transfer.escalation === 0) return transfer.amount;
  const years = daysBetween(start, when) / 365.25;
  return transfer.amount * (1 + transfer.escalation) ** years;
}

/** A sweep is deliberately just another scheduled transfer. Its retained
 * balance follows the same nominal escalation as a fixed amount; it never
 * tops the source up and never chooses a destination. */
function sweptAmount(transfer: Transfer, balances: Balances, loans: Set<string>, when: ISODate, start: ISODate): number {
  if (!transfer.outOf || transfer.sweepAbove === undefined) return 0;
  const retained = transfer.escalation === 0
    ? transfer.sweepAbove
    : transfer.sweepAbove * (1 + transfer.escalation) ** (daysBetween(start, when) / 365.25);
  const excess = Math.max(0, balances[transfer.outOf] - retained);
  if (!transfer.into || !loans.has(transfer.into)) return excess;
  return Math.min(excess, Math.max(0, balances[transfer.into]));
}

function arrivingAmount(accountName: string, amount: number, debts: Set<string>, loans: Set<string>): number {
  return debts.has(accountName) || loans.has(accountName) ? -amount : amount;
}

function checkGoals(
  budget: Budget,
  balances: Balances,
  rates: Rates,
  pending: Goal[],
  completed: [string, ISODate][],
  active: Transfer[],
  stopped: Set<Transfer>,
  when: ISODate,
  alreadyAtTarget: Set<Goal>,
): { pending: Goal[]; exit: boolean } {
  const stillPending: Goal[] = [];
  let exit = false;
  for (const goal of pending) {
    // Worked out before the goal fires, because firing consumes it.
    const atTarget = balanceReached(budget, balances, goal);
    const crossedToday = atTarget && !alreadyAtTarget.has(goal);
    if (atTarget) alreadyAtTarget.add(goal);

    if (reached(budget, balances, goal, when)) {
      // Snapping absorbs the overshoot from checking only once a day, which
      // is what makes "paid off" land on exactly 0 rather than -37.42. It's
      // only ever a rounding correction, so it's only safe on the day the
      // balance actually crossed. A conjunctive goal that spent five years
      // waiting on a birthday crossed long ago, and rewriting the balance
      // then would invent or destroy real money.
      if (crossedToday) snapToTarget(goal, balances);
      completed.push([goal.name, when]);
      applyOverrides(goal, budget.inflation, active, stopped, when);
      applyRateOverrides(goal, rates);
      if (goal.exit) exit = true;
    } else {
      stillPending.push(goal);
    }
  }
  return { pending: stillPending, exit };
}

/** By date, or by amount, or -- with `wait_for_both` -- the later of the
 * two. For an amount, which direction counts as "reached" depends on where
 * the target sits relative to where the account started, not on whether the
 * account is a "saving" one. */
function reached(budget: Budget, balances: Balances, goal: Goal, when: ISODate): boolean {
  if (goal.by === null) return balanceReached(budget, balances, goal);
  if (when < goal.by) return false;
  return goal.waitForBoth ? balanceReached(budget, balances, goal) : true;
}

function balanceReached(budget: Budget, balances: Balances, goal: Goal): boolean {
  // checkGoals calls this for every pending goal every day, including a
  // pure date/age goal that never named an account -- it has no balance to
  // be "at", so it's never at it.
  if (goal.account === null || goal.target === null) return false;
  const startingBalance = budget.account(goal.account).balance;
  if (goal.target >= startingBalance) return balances[goal.account] >= goal.target;
  return balances[goal.account] <= goal.target;
}

/** Snaps a goal's account to exactly its target on the day the balance
 * crosses -- see the crossedToday comment above. Guarded because a date-only
 * goal has no account to snap. */
function snapToTarget(goal: Goal, balances: Balances): void {
  if (goal.account === null || goal.target === null) return;
  balances[goal.account] = goal.target;
}

function applyOverrides(
  goal: Goal,
  inflation: number,
  active: Transfer[],
  stopped: Set<Transfer>,
  when: ISODate,
): void {
  for (const override of goal.transfers) {
    const matches = liveNamed(active, stopped, override.name);
    if (matches.length > 0) {
      const { name, ...fields } = override;
      for (const existing of matches) {
        stopped.add(existing);
        const replacement = { ...existing, ...fields } as Transfer;
        // `amount: 0` is the established way to stop a named transfer. A
        // sweep has no useful fixed amount, so make the two forms mutually
        // exclusive when an override changes one into the other.
        if (override.amount !== undefined && override.sweepAbove === undefined) replacement.sweepAbove = undefined;
        if (override.sweepAbove !== undefined) replacement.amount = 0;
        active.push(replacement);
      }
    } else {
      const every = override.every ?? "fortnight";
      active.push({
        name: override.name,
        amount: override.amount ?? 0,
        every,
        day: override.day ?? onceDay(every, when),
        outOf: override.outOf ?? null,
        into: override.into ?? null,
        escalation: override.escalation ?? inflation,
        sweepAbove: override.sweepAbove,
      });
    }
  }
}

/** A goal introducing a one-off transfer with no date of its own means "when
 * this goal fires" -- a lease balloon payment the day the lease ends, say.
 * There's no date you could sensibly write in advance for that: a balance-
 * or age-triggered goal's completion date is whatever the simulation works
 * out. Tomorrow, not today, because run()'s loop already made today's
 * transfer pass before it got round to checking goals. Any other frequency
 * keeps its own schedule and gets nothing invented for it. */
function onceDay(every: string, when: ISODate): ISODate | null {
  return every === "once" ? addDays(when, 1) : null;
}

function applyRateOverrides(goal: Goal, rates: Rates): void {
  for (const override of goal.accounts) {
    rates[override.name] = override.rate;
  }
}

/** Every currently-live transfer with this name -- there can be more than
 * one (both partners paying into joint savings), and a name from an
 * earlier override can also collide, so this only looks at what's live. */
function liveNamed(active: Transfer[], stopped: Set<Transfer>, name: string): Transfer[] {
  const matches: Transfer[] = [];
  for (const transfer of active) {
    if (transfer.name === name && !stopped.has(transfer)) matches.push(transfer);
  }
  return matches;
}
