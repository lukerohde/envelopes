/** `everyday | saving | loan` was three names doing six jobs. A pay account
 * and a groceries envelope were both "everyday", but one should never trend
 * and the other's balance is just cumulative spend -- so nothing could tell
 * you that years of surplus had quietly pooled in the pay account, because
 * there was no way to say what a pay account is *for*.
 *
 * The safety argument for changing this: `kind` reaches the simulation in
 * exactly one place, debtAccounts() testing `=== "loan"`. Keep loan named
 * loan and no milestone can move. That's asserted here rather than assumed.
 */

import { describe, expect, it } from "vitest";
import { ACCOUNT_KINDS, canOffset, load } from "../src/model";
import { run } from "../src/simulate";
import { groupAccounts, parseYamlIntoState } from "../src/state";
import { formatReport } from "../src/report";

function config(kinds: Record<string, string>): string {
  const accounts = Object.entries(kinds)
    .map(([name, kind]) => `  - {name: ${name}, balance: 0, kind: ${kind}}`)
    .join("\n");
  return `inflation: 0.03\naccounts:\n${accounts}\ntransfers: []\ngoals: []\nbirthdays: []\n`;
}

describe("the six kinds", () => {
  it("names one job each", () => {
    expect(ACCOUNT_KINDS).toEqual(["clearing", "expense", "sinking", "saving", "investment", "loan"]);
  });

  it("loads every one of them", () => {
    const budget = load(config(Object.fromEntries(ACCOUNT_KINDS.map((k) => [`a-${k}`, k]))));
    expect(budget.accounts.map((a) => a.kind)).toEqual([...ACCOUNT_KINDS]);
  });

  // Share links in the wild carry the old vocabulary and must keep working.
  it("still reads the old `everyday` as an expense envelope", () => {
    expect(load(config({ groceries: "everyday" })).accounts[0].kind).toBe("expense");
  });

  it("defaults to expense when nothing says otherwise", () => {
    expect(load("accounts:\n  - {name: groceries}\ntransfers: []\ngoals: []\n").accounts[0].kind).toBe("expense");
  });

  // load() used to cast `kind` straight through, so a typo was silently
  // accepted and the account just never matched any rule that cared.
  it("refuses a kind it doesn't know, and says what it does know", () => {
    expect(() => load(config({ pay: "checkings" }))).toThrow(/checkings/);
    expect(() => load(config({ pay: "checkings" }))).toThrow(/clearing/);
  });
});

describe("canOffset", () => {
  it("allows any account that really holds money", () => {
    for (const kind of ["clearing", "sinking", "saving", "investment"] as const) {
      expect(canOffset(kind), kind).toBe(true);
    }
  });

  // A pass-through envelope has no money sitting in it to offset with, and a
  // loan offsetting a loan is just a smaller loan.
  it("refuses expense envelopes and loans", () => {
    expect(canOffset("expense")).toBe(false);
    expect(canOffset("loan")).toBe(false);
  });
});

describe("renaming a kind can't move a number", () => {
  const OLD = `
inflation: 0.03
birthdays: [{name: alex, born: 1984-03-15}]
accounts:
  - {name: pay, balance: 5000, kind: everyday}
  - {name: groceries, balance: 0, kind: everyday}
  - {name: mortgage, balance: 200000, kind: loan, rate: 0.06}
  - {name: offset, balance: 20000, kind: saving, offsets: mortgage}
transfers:
  - {name: salary, amount: 3000, every: fortnight, day: 2026-01-02, into: pay}
  - {name: shopping, amount: 200, every: week, day: sat, out_of: pay, into: groceries}
  - {name: repayment, amount: 2000, every: month, day: 5, out_of: pay, into: mortgage}
goals:
  - {name: house paid off, account: mortgage, target: 0, transfers: []}
`;
  const NEW = OLD.replace("name: pay, balance: 5000, kind: everyday", "name: pay, balance: 5000, kind: clearing")
    .replace("name: groceries, balance: 0, kind: everyday", "name: groceries, balance: 0, kind: expense")
    .replace("name: offset, balance: 20000, kind: saving", "name: offset, balance: 20000, kind: sinking");

  it("gives byte-identical results before and after migrating the vocabulary", () => {
    const before = run(load(OLD), "2026-01-01", "2046-01-01");
    const after = run(load(NEW), "2026-01-01", "2046-01-01");
    expect(after.completed).toEqual(before.completed);
    expect(after.balances).toEqual(before.balances);
  });

  it("still treats a loan as a debt, which is the one thing kind decides", () => {
    const { balances } = run(load(NEW), "2026-01-01", "2046-01-01");
    expect(balances["mortgage"]).toBeLessThan(200000);
  });
});

describe("grouping for the UI", () => {
  it("puts every kind somewhere, debts first and spending last", () => {
    const state = parseYamlIntoState(config(Object.fromEntries(ACCOUNT_KINDS.map((k) => [`a-${k}`, k]))));
    const labels = groupAccounts(state.accounts).map((g) => g.label);
    expect(labels).toEqual(["Loans", "Investments", "Savings", "Sinking funds", "Clearing", "Spending"]);
  });

  it("skips a group nobody has an account in", () => {
    const state = parseYamlIntoState(config({ mortgage: "loan" }));
    expect(groupAccounts(state.accounts).map((g) => g.label)).toEqual(["Loans"]);
  });
});

// `groceries 1,197,776.46` under a heading that says "balances" reads as a
// bug. Under one that says what it is -- everything spent on groceries since
// the run began -- it reads as information.
describe("the report separates spend from balances", () => {
  const SPEND = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 10000, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
  - {name: mortgage, balance: 1000, kind: loan}
transfers:
  - {name: shopping, amount: 100, every: week, day: sat, out_of: pay, into: groceries}
goals: []
`;

  it("files an expense envelope under cumulative spend, not balances", () => {
    const budget = load(SPEND);
    const { balances, completed } = run(budget, "2026-01-01", "2027-01-01");
    const text = formatReport("c.yml", "2026-01-01", budget, balances, completed);

    const balancesAt = text.indexOf("balances at the end of the run");
    const spendAt = text.indexOf("spent by category since 2026-01-01");
    expect(spendAt).toBeGreaterThan(balancesAt);
    expect(text.indexOf("groceries")).toBeGreaterThan(spendAt);
    expect(text.indexOf("mortgage")).toBeLessThan(spendAt);
  });

  it("leaves the spend section out entirely when there's nothing in it", () => {
    const budget = load(SPEND.replace("kind: expense", "kind: sinking"));
    const { balances, completed } = run(budget, "2026-01-01", "2027-01-01");
    expect(formatReport("c.yml", "2026-01-01", budget, balances, completed)).not.toContain("spent by category");
  });
});
