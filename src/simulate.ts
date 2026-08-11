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
 */

import type { Budget, Goal, Transfer } from "./model";
import { daysBetween, type ISODate } from "./dates";
import { fires } from "./schedule";

type Balances = Record<string, number>;
type Rates = Record<string, number>;
export type History = Record<string, [ISODate, number][]>;

export interface RunResult {
  balances: Balances;
  completed: [string, ISODate][];
  history: History;
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
  const stopped = new Set<Transfer>();
  const active = [...budget.transfers];
  let pending = [...budget.goals];
  const completed: [string, ISODate][] = [];
  const history: History = {};
  for (const name of track) history[name] = [];

  let when = start;
  while (when < end) {
    grow(balances, rates, offsetBy);
    applyTransfers(active, balances, debts, stopped, when, start);
    if (pending.length > 0) {
      pending = checkGoals(budget, balances, rates, pending, completed, active, stopped, when);
    }
    for (const name of track) history[name].push([when, balances[name]]);
    when = addDays(when, 1);
  }

  return { balances, completed, history };
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
    if (budget.account(goal.account).kind === "loan") names.add(goal.account);
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
function grow(balances: Balances, rates: Rates, offsetBy: Map<string, string[]>): void {
  for (const name of Object.keys(balances)) {
    const principal = effectivePrincipal(name, balances, offsetBy);
    balances[name] += (principal * rates[name]) / 365.25;
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
  stopped: Set<Transfer>,
  when: ISODate,
  start: ISODate,
): void {
  for (const transfer of active) {
    if (stopped.has(transfer)) continue;
    if (!fires(transfer.every, transfer.day as string | number, when)) continue;
    const amount = escalated(transfer, when, start);
    if (transfer.outOf) balances[transfer.outOf] -= amount;
    if (transfer.into) balances[transfer.into] += arrivingAmount(transfer.into, amount, debts);
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

function arrivingAmount(accountName: string, amount: number, debts: Set<string>): number {
  return debts.has(accountName) ? -amount : amount;
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
): Goal[] {
  const stillPending: Goal[] = [];
  for (const goal of pending) {
    if (reached(budget, balances, goal, when)) {
      if (goal.by === null) balances[goal.account] = goal.target;
      completed.push([goal.name, when]);
      applyOverrides(goal, budget.inflation, active, stopped, when);
      applyRateOverrides(goal, rates);
    } else {
      stillPending.push(goal);
    }
  }
  return stillPending;
}

/** By date, or by amount -- and for an amount, which direction depends on
 * where the target sits relative to where the account started, not on
 * whether the account is a "saving" one. */
function reached(budget: Budget, balances: Balances, goal: Goal, when: ISODate): boolean {
  if (goal.by !== null) return when >= goal.by;
  const startingBalance = budget.account(goal.account).balance;
  if (goal.target >= startingBalance) return balances[goal.account] >= goal.target;
  return balances[goal.account] <= goal.target;
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
        active.push({ ...existing, ...fields } as Transfer);
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
