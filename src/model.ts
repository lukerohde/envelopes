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
 * "super alex"), `sources` because nothing ever read it. `exit` went too --
 * it existed only so a goal could end the simulation, but that's what an
 * account's own floor is for; a goal doesn't need a second way to say it.
 *
 * `by_age` is sugar, not a real field: "alex turns 60" is just a date once
 * you know alex's birthday, so load() resolves it straight into `by` and
 * the rest of the engine never knows it existed.
 */

import yaml from "js-yaml";
import { year as yearOf, month as monthOf, dayOfMonth, type ISODate } from "./dates";

export interface Account {
  name: string;
  balance: number;
  floor: number;
  kind: "everyday" | "saving" | "loan";
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
}

export interface RhythmOverride {
  name: string;
  amount?: number;
  every?: string;
  day?: string | number;
  outOf?: string | null;
  into?: string | null;
  escalation?: number;
}

export interface AccountOverride {
  name: string;
  rate: number;
}

export interface Goal {
  name: string;
  account: string;
  target: number;
  by: ISODate | null;
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
      kind: (item.kind as Account["kind"]) ?? "everyday",
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
      amount: item.amount as number,
      every: item.every as string,
      day: normalizeDay(item.day),
      outOf: (item.out_of as string) ?? null,
      into: (item.into as string) ?? null,
      escalation: item.escalation === undefined ? inflation : (item.escalation as number),
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
      account: item.account as string,
      target: item.target as number,
      by,
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
    if (transfer.outOf) budget.account(transfer.outOf);
    if (transfer.into) budget.account(transfer.into);
  }
  for (const goal of budget.goals) {
    budget.account(goal.account);
  }
  for (const account of budget.accounts) {
    if (account.offsets) budget.account(account.offsets);
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
