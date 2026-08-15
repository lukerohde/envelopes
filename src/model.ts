/** The budget: accounts money sits in, transfers that move it, goals that
 * complete. Ported from the Python engine (fridge/model.py) -- see
 * aidlc-docs/aidlc-state.md in the cashflow repo for the history.
 *
 * A goal's trigger is either `by` (a date) or, if that's absent, its own
 * `target`/`account` (a balance). There used to be a third field here,
 * `contribution`, mirroring the Python model -- traced through simulate.py
 * and found to be entirely unused by the simulator itself (it only ever fed
 * the now-deleted closed-form solve.py). Dropped rather than carried forward
 * as dead config surface. `who` and `sources` went the same way later --
 * `who` because an account's own name already says whose it is ("sam pay",
 * "super alex"), `sources` because nothing ever read it. `exit` is kept as
 * an explicit end-of-life marker: a plan can intentionally stop at a declared
 * terminal boundary rather than treating the account reaching it as a fault.
 *
 * `by_age` is sugar, not a real field: "alex turns 60" is just a date once
 * you know alex's birthday, so load() resolves it straight into `by` and
 * the rest of the engine never knows it existed.
 */

import yaml from "js-yaml";
import { year as yearOf, month as monthOf, dayOfMonth, type ISODate } from "./dates";

/** What an account is *for*. Each one carries an invariant you can check a
 * plan against, which is the whole reason there are six rather than three:
 *
 *   clearing    pay                 shouldn't trend -- growth is surplus
 *                                   going nowhere in particular
 *   expense     groceries, a card   pure pass-through; the balance is just
 *                                   cumulative spend, not money you have
 *   sinking     travel, a car fund  fills and empties on a cycle; flat in
 *                                   real terms across a full one
 *   saving      early retirement    accumulates to a target, drains once
 *   investment  super               rate should beat inflation; never negative
 *   loan        mortgage            pays down to zero
 *
 * `everyday` used to cover the first three at once, which is why nothing
 * could tell you a pay account had quietly accumulated a year's spending.
 */
export const ACCOUNT_KINDS = ["clearing", "expense", "sinking", "saving", "investment", "loan"] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

/** Share links in the wild carry the old vocabulary, and a link that stops
 * loading is the one failure mode this rename mustn't have. `everyday`
 * becomes `expense` because that's what most everyday accounts were; a pay
 * account wants `clearing`, but nothing breaks if it doesn't get it -- the
 * kind only ever narrows what a lint rule will say. */
const KIND_ALIASES: Record<string, AccountKind> = { everyday: "expense" };

/** Whether this kind of account can sit against a loan. An expense envelope
 * has no money in it to offset with, and a loan offsetting a loan is just a
 * smaller loan. Everything else really holds money, including a clearing
 * account -- plenty of real offsets are the everyday transaction account. */
export function canOffset(kind: AccountKind): boolean {
  return kind !== "expense" && kind !== "loan";
}

/** Exported because state.ts parses YAML into UI state on its own path and
 * has to read `kind` exactly the same way -- one implementation, or a share
 * link would load in the app and fail in the CLI. */
export function parseAccountKind(value: unknown): AccountKind {
  if (value === undefined || value === null) return "expense";
  const named = String(value);
  const aliased = KIND_ALIASES[named] ?? named;
  if (!(ACCOUNT_KINDS as readonly string[]).includes(aliased)) {
    throw new Error(`unknown account kind: ${named} -- expected one of ${ACCOUNT_KINDS.join(", ")}`);
  }
  return aliased as AccountKind;
}

export interface Account {
  name: string;
  balance: number;
  floor: number;
  kind: AccountKind;
  rate: number;
  offsets: string | null;
}

export interface Transfer {
  name: string;
  amount: number;
  every: string;
  day: string | number | null;
  outOf: string | null;
  into: string | null;
  escalation: number;
  /** A named rebudget transfer retains this amount in a clearing account and
   * moves only the excess when it fires. It is optional so old configs and
   * the structured editor keep their fixed-amount shape. */
  sweepAbove?: number;
}

export interface RhythmOverride {
  name: string;
  amount?: number;
  every?: string;
  day?: string | number;
  outOf?: string | null;
  into?: string | null;
  escalation?: number;
  sweepAbove?: number;
}

export interface AccountOverride {
  name: string;
  rate: number;
}

export interface Goal {
  name: string;
  /** Null when the goal is triggered purely by date or age -- `account` and
   * `target` are only ever read for a balance trigger, so a pure `by`/`by_age`
   * goal has no business naming an account. */
  account: string | null;
  target: number | null;
  by: ISODate | null;
  /** Require the date *and* the balance, rather than the date alone.
   *
   * "The bridge fund is empty and Luke is 60" is the most important guard an
   * early-retirement plan has, and without this it can't be written down.
   * Opt-in rather than inferred from both fields being set, because the UI
   * writes `account` and `target` on every goal it emits -- including
   * date-triggered ones, where they've always been ignored. Inferring AND
   * would change the meaning of every share link already out there. */
  waitForBoth: boolean;
  /** Stop the simulation on the day this goal completes. This is for an
   * intentional terminal boundary, not for ordinary milestones. */
  exit: boolean;
  transfers: RhythmOverride[];
  accounts: AccountOverride[];
}

export interface Birthday {
  name: string;
  born: ISODate;
}

export class Budget {
  constructor(
    public accounts: Account[],
    public transfers: Transfer[],
    public goals: Goal[],
    public inflation: number,
    public birthdays: Birthday[],
  ) {}

  account(name: string): Account {
    for (const account of this.accounts) {
      if (account.name === name) return account;
    }
    throw new Error(`no such account: ${name}`);
  }

  has(name: string): boolean {
    return this.accounts.some((account) => account.name === name);
  }
}

export function load(yamlText: string): Budget {
  const raw = (yaml.load(yamlText) ?? {}) as Record<string, unknown>;
  const inflation = (raw.inflation as number) ?? 0;

  const accounts: Account[] = [];
  for (const item of (raw.accounts as Record<string, unknown>[]) ?? []) {
    accounts.push({
      name: item.name as string,
      balance: (item.balance as number) ?? 0,
      floor: (item.floor as number) ?? 0,
      kind: parseAccountKind(item.kind),
      rate: (item.rate as number) ?? 0,
      offsets: (item.offsets as string) ?? null,
    });
  }

  // `rhythms` was the name in the Python engine and in Luke's own existing
  // configs -- accepted here as an alias so they load unchanged, same as
  // the goal-level override list below already does.
  const transferItems = (raw.transfers as Record<string, unknown>[]) ?? (raw.rhythms as Record<string, unknown>[]) ?? [];
  const transfers: Transfer[] = [];
  for (const item of transferItems) {
    transfers.push({
      name: item.name as string,
      amount: (item.amount as number) ?? 0,
      every: item.every as string,
      day: normalizeDay(item.day),
      outOf: (item.out_of as string) ?? null,
      into: (item.into as string) ?? null,
      escalation: item.escalation === undefined ? inflation : (item.escalation as number),
      sweepAbove: item.sweep_above === undefined ? undefined : (item.sweep_above as number),
    });
  }

  // parsed before goals, since a `by_age` goal trigger needs to look
  // someone's birthday up while goals are still being read
  const birthdays: Birthday[] = [];
  for (const item of (raw.birthdays as Record<string, unknown>[]) ?? []) {
    birthdays.push({ name: item.name as string, born: normalizeDay(item.born) as ISODate });
  }

  const goals: Goal[] = [];
  for (const item of (raw.goals as Record<string, unknown>[]) ?? []) {
    const rhythmItems = (item.transfers as Record<string, unknown>[]) ?? (item.rhythms as Record<string, unknown>[]) ?? [];
    const transferOverrides: RhythmOverride[] = [];
    for (const r of rhythmItems) {
      const override: RhythmOverride = { name: r.name as string };
      if (r.amount !== undefined) override.amount = r.amount as number;
      if (r.every !== undefined) override.every = r.every as string;
      if (r.day !== undefined) override.day = normalizeDay(r.day) as string | number;
      if (r.out_of !== undefined) override.outOf = r.out_of as string | null;
      if (r.into !== undefined) override.into = r.into as string | null;
      if (r.escalation !== undefined) override.escalation = r.escalation as number;
      if (r.sweep_above !== undefined) override.sweepAbove = r.sweep_above as number;
      transferOverrides.push(override);
    }

    const accountOverrides: AccountOverride[] = [];
    for (const a of (item.accounts as Record<string, unknown>[]) ?? []) {
      accountOverrides.push({ name: a.name as string, rate: a.rate as number });
    }

    let by: ISODate | null = item.by === undefined ? null : (normalizeDay(item.by) as ISODate);
    if (item.by_age !== undefined) {
      const byAge = item.by_age as Record<string, unknown>;
      by = dateOfBirthday(birthdays, byAge.person as string, byAge.turns as number);
    }

    goals.push({
      name: item.name as string,
      account: item.account === undefined ? null : (item.account as string),
      target: item.target === undefined ? null : (item.target as number),
      by,
      waitForBoth: item.wait_for_both === true,
      exit: item.exit === true,
      transfers: transferOverrides,
      accounts: accountOverrides,
    });
  }

  const budget = new Budget(accounts, transfers, goals, inflation, birthdays);
  check(budget);
  return budget;
}

function check(budget: Budget): void {
  for (const transfer of budget.transfers) {
    if (!transfer.outOf && !transfer.into) {
      throw new Error(`transfer '${transfer.name}' moves money nowhere`);
    }
    if (transfer.outOf && !budget.has(transfer.outOf)) {
      throw new Error(`transfer '${transfer.name}' refers to no such account: ${transfer.outOf}`);
    }
    if (transfer.into && !budget.has(transfer.into)) {
      throw new Error(`transfer '${transfer.name}' refers to no such account: ${transfer.into}`);
    }
    if (transfer.sweepAbove !== undefined) {
      if (!Number.isFinite(transfer.sweepAbove) || transfer.sweepAbove < 0) {
        throw new Error(`transfer '${transfer.name}' has an invalid sweep_above`);
      }
      if (transfer.amount !== 0) throw new Error(`transfer '${transfer.name}' cannot combine amount and sweep_above`);
      if (!transfer.outOf || budget.account(transfer.outOf).kind !== "clearing") {
        throw new Error(`transfer '${transfer.name}' sweep_above source must be clearing`);
      }
      if (transfer.outOf === transfer.into) throw new Error(`transfer '${transfer.name}' sweeps into its source`);
    }
  }
  for (const goal of budget.goals) {
    // A goal with no date fires on its balance alone, and wait_for_both asks
    // for the balance on top of the date -- either way it needs somewhere to
    // read that balance from. A goal with neither a date nor a balance has no
    // trigger at all, and would otherwise just silently never fire.
    if (goal.by === null || goal.waitForBoth) {
      if (goal.account === null || goal.target === null) {
        throw new Error(`goal '${goal.name}' needs an account and target to trigger on balance`);
      }
    }
    if (goal.account !== null && !budget.has(goal.account)) {
      throw new Error(`goal '${goal.name}' refers to no such account: ${goal.account}`);
    }
  }
  for (const account of budget.accounts) {
    if (account.offsets && !budget.has(account.offsets)) {
      throw new Error(`account '${account.name}' offsets no such account: ${account.offsets}`);
    }
  }
}

/** The date a named person turns a given age -- their birthday, that many
 * years after they were born, counting the birthday itself as the new age
 * (same convention as dates.ts's own ageAt). */
function dateOfBirthday(birthdays: Birthday[], person: string, age: number): ISODate {
  let born: ISODate | null = null;
  for (const birthday of birthdays) {
    if (birthday.name === person) born = birthday.born;
  }
  if (!born) throw new Error(`no birthday recorded for: ${person}`);
  const targetYear = yearOf(born) + age;
  return `${targetYear}-${String(monthOf(born)).padStart(2, "0")}-${String(dayOfMonth(born)).padStart(2, "0")}`;
}

/** js-yaml parses bare "YYYY-MM-DD" scalars as JS Date objects (same as
 * PyYAML does for the Python engine) -- normalize back to a plain ISO
 * string. Anything else (a weekday name, a day-of-month number, a bare
 * "MM-DD" string with no year) passes through untouched. */
function normalizeDay(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value as string | number;
}
