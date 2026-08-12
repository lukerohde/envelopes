import { describe, expect, it } from "vitest";
import { load } from "../src/model";

const MINIMAL = `
accounts:
  - {name: pay, balance: 7686, floor: 500}
  - {name: groceries}
transfers:
  - {name: medibank, amount: 352, every: month, day: 28, out_of: pay}
  - {name: groceries, amount: 150, every: week, day: sun, out_of: pay, into: groceries}
goals:
  - {name: balloon, account: pay, target: 24000, by: 2030-12-12}
`;

describe("load -- accounts", () => {
  it("parses every field, defaulting what's omitted", () => {
    const budget = load(MINIMAL);
    expect(budget.accounts.map((a) => a.name)).toEqual(["pay", "groceries"]);
    expect(budget.account("pay").balance).toBe(7686);
    expect(budget.account("pay").floor).toBe(500);
    expect(budget.account("groceries").balance).toBe(0);
    expect(budget.account("groceries").kind).toBe("expense");
  });

  it("parses kind and offsets", () => {
    const budget = load(`
accounts:
  - {name: mortgage, balance: 100000, kind: loan}
  - {name: offset, kind: saving, offsets: mortgage}
`);
    expect(budget.account("mortgage").kind).toBe("loan");
    expect(budget.account("offset").kind).toBe("saving");
    expect(budget.account("offset").offsets).toBe("mortgage");
    expect(budget.account("mortgage").offsets).toBeNull();
  });

  it("throws a clear error for an unknown account name", () => {
    const budget = load(MINIMAL);
    expect(() => budget.account("nope")).toThrow(/no such account/);
  });
});

describe("load -- transfers", () => {
  it("accepts the old top-level 'rhythms:' key as an alias for 'transfers:', so real existing configs load unchanged", () => {
    const budget = load(`
accounts:
  - {name: pay, balance: 1000}
rhythms:
  - {name: groceries, amount: 100, every: week, day: sun, out_of: pay}
`);
    expect(budget.transfers.map((t) => t.name)).toEqual(["groceries"]);
    expect(budget.transfers[0].amount).toBe(100);
  });

  it("leaves out_of/into as null when omitted, not undefined-crashing", () => {
    const budget = load(MINIMAL);
    const [medibank, groceries] = budget.transfers;
    expect(medibank.into).toBeNull();
    expect(medibank.outOf).toBe("pay");
    expect(groceries.into).toBe("groceries");
  });

  it("defaults escalation to 0 with no inflation set", () => {
    const budget = load(MINIMAL);
    expect(budget.transfers[0].escalation).toBe(0);
  });
});

describe("load -- goals", () => {
  it("parses a date-triggered goal", () => {
    const budget = load(MINIMAL);
    expect(budget.goals[0].by).toBe("2030-12-12");
    expect(budget.goals[0].target).toBe(24000);
  });

  it("a goal with no 'by' is still valid -- balance-triggered by target/account alone", () => {
    const text = MINIMAL.replace("target: 24000, by: 2030-12-12", "target: 24000");
    const budget = load(text);
    expect(budget.goals[0].by).toBeNull();
  });

  it("'by_age' resolves to the date that person turns that age, same as writing 'by' directly", () => {
    const text = `
accounts:
  - {name: pay, balance: 0}
birthdays:
  - {name: alex, born: 1984-03-14}
goals:
  - {name: retire, account: pay, target: 0, by_age: {person: alex, turns: 60}}
`;
    const budget = load(text);
    expect(budget.goals[0].by).toBe("2044-03-14");
  });
});

describe("load -- inflation default escalation", () => {
  it("a global inflation rate becomes each transfer's default escalation", () => {
    const text = `
inflation: 0.03
accounts:
  - {name: pay, balance: 0}
transfers:
  - {name: salary, amount: 1000, every: fortnight, day: 2026-01-01, into: pay}
`;
    const budget = load(text);
    expect(budget.transfers[0].escalation).toBe(0.03);
  });

  it("a transfer's own escalation overrides the global default", () => {
    const text = `
inflation: 0.03
accounts:
  - {name: pay, balance: 0}
  - {name: mortgage, balance: 1000}
transfers:
  - {name: repayment, amount: 100, every: month, day: 1, out_of: pay, into: mortgage, escalation: 0}
`;
    const budget = load(text);
    expect(budget.transfers[0].escalation).toBe(0);
  });
});

describe("load -- birthdays", () => {
  it("parses a birthdays list", () => {
    const text = MINIMAL + `
birthdays:
  - {name: luke, born: 1978-06-14}
`;
    const budget = load(text);
    expect(budget.birthdays[0]).toEqual({ name: "luke", born: "1978-06-14" });
  });

  it("defaults to an empty list", () => {
    const budget = load(MINIMAL);
    expect(budget.birthdays).toEqual([]);
  });
});
