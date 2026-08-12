/** A named finding beats a table someone has to interpret. Every rule here
 * fired on a real plan and nothing said a word: a super account ending deep
 * in the red, a pay account quietly banking years of surplus, and a sinking
 * fund taking money in for forty years and never paying any out.
 *
 * Each rule reads the phase flows Phase 8 already collects -- no second
 * traversal, and the same numbers the --flows table shows, so a finding can
 * always be checked against the row it came from.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { lint } from "../src/lint";

function findings(yamlText: string, years = 20): string[] {
  const budget = load(yamlText);
  const end = `${2026 + years}-01-01`;
  const result = run(budget, "2026-01-01", end);
  return lint(budget, result, "2026-01-01", end).map((f) => f.rule);
}

/** Every dollar that arrives is allocated, and both sides escalate together
 * so they stay matched. This is what a calibrated plan looks like -- if any
 * rule fires on it, that rule is too eager. */
function clean(): string {
  return `
inflation: 0.03
birthdays: [{name: alex, born: 1980-01-01}]
accounts:
  - {name: pay, balance: 5000, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 1000, every: fortnight, day: 2026-01-02, into: pay}
  - {name: shopping, amount: 1000, every: fortnight, day: 2026-01-02, out_of: pay, into: groceries}
goals: []
`;
}

describe("a plan with nothing wrong with it", () => {
  it("gets no findings", () => {
    expect(findings(clean())).toEqual([]);
  });
});

describe("account-ends-negative", () => {
  it("catches the reference plan's actual bug -- super finishing below zero", () => {
    const plan = `
inflation: 0.03
birthdays: [{name: alex, born: 1980-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: super, balance: 100000, kind: investment, rate: 0.0}
transfers:
  - {name: drawdown, amount: 2000, every: fortnight, day: 2026-01-02, out_of: super, into: pay, escalation: 0}
goals: []
`;
    expect(findings(plan)).toContain("account-ends-negative");
  });

  it("says which account and how far under", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: super, balance: 1000, kind: investment}
transfers:
  - {name: drawdown, amount: 500, every: month, day: 5, out_of: super, into: pay, escalation: 0}
goals: []
`);
    const result = run(budget, "2026-01-01", "2028-01-01");
    const finding = lint(budget, result, "2026-01-01", "2028-01-01").find((f) => f.rule === "account-ends-negative")!;
    expect(finding.account).toBe("super");
    expect(finding.detail).toMatch(/-?[\d,]+/);
  });
});

describe("clearing-account-accumulating", () => {
  it("catches income that no envelope ever claimed", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2000, every: fortnight, day: 2026-01-02, into: pay, escalation: 0}
  - {name: shopping, amount: 100, every: fortnight, day: 2026-01-02, out_of: pay, into: groceries, escalation: 0}
goals: []
`;
    expect(findings(plan)).toContain("clearing-account-accumulating");
  });

  // A clearing account is meant to hold a buffer; only a *trend* is wrong.
  it("leaves a clearing account that merely holds a float alone", () => {
    expect(findings(clean())).not.toContain("clearing-account-accumulating");
  });
});

describe("saving-below-inflation", () => {
  it("catches a balance that grows in dollars and shrinks in what it buys", () => {
    const plan = `
inflation: 0.03
birthdays: []
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: nest, balance: 50000, kind: saving, rate: 0.01}
transfers:
  - {name: saving, amount: 100, every: month, day: 5, out_of: pay, into: nest, escalation: 0}
goals: []
`;
    expect(findings(plan)).toContain("saving-below-inflation");
  });

  it("is happy when the rate beats inflation", () => {
    const plan = `
inflation: 0.03
birthdays: []
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: nest, balance: 50000, kind: saving, rate: 0.06}
transfers:
  - {name: saving, amount: 100, every: month, day: 5, out_of: pay, into: nest, escalation: 0}
goals: []
`;
    expect(findings(plan)).not.toContain("saving-below-inflation");
  });
});

describe("sinking-fund-trending", () => {
  it("catches a holiday fund that fills up forever and is never spent", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: holidays, balance: 0, kind: sinking}
transfers:
  - {name: saving up, amount: 200, every: month, day: 5, out_of: pay, into: holidays, escalation: 0}
goals: []
`;
    expect(findings(plan)).toContain("sinking-fund-trending");
  });

  it("is happy when it empties again", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: holidays, balance: 0, kind: sinking}
transfers:
  - {name: saving up, amount: 200, every: month, day: 5, out_of: pay, into: holidays, escalation: 0}
  - {name: the holiday, amount: 2400, every: year, day: 12-01, out_of: holidays, into: pay, escalation: 0}
goals: []
`;
    expect(findings(plan)).not.toContain("sinking-fund-trending");
  });
});

describe("goal-never-fires", () => {
  it("catches a goal the run never reaches", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: nest, balance: 0, kind: saving}
transfers:
  - {name: saving, amount: 10, every: year, day: 1-1, out_of: pay, into: nest, escalation: 0}
goals:
  - {name: a million dollars, account: nest, target: 1000000, transfers: []}
`;
    expect(findings(plan)).toContain("goal-never-fires");
  });
});

describe("super-before-preservation-age", () => {
  it("catches an investment account drawn down before its owner turns 60", () => {
    const plan = `
inflation: 0
birthdays: [{name: alex, born: 1990-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: super alex, balance: 500000, kind: investment}
transfers:
  - {name: super drawdown, amount: 1000, every: month, day: 5, out_of: super alex, into: pay, escalation: 0}
goals: []
`;
    expect(findings(plan)).toContain("super-before-preservation-age");
  });

  // Super fees and contributions tax leave the account every month from day
  // one. Counting those as a drawdown accused every plan in existence of
  // raiding its super at 48, which is how this was caught.
  it("doesn't mistake fees and contributions tax for a raid on the fund", () => {
    const plan = `
inflation: 0
birthdays: [{name: alex, born: 1990-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: super alex, balance: 500000, kind: investment}
transfers:
  - {name: salary, amount: 2000, every: fortnight, day: 2026-01-02, into: pay, escalation: 0}
  - {name: super fees, amount: 290, every: month, day: 15, out_of: super alex, escalation: 0}
  - {name: super contribution tax, amount: 294, every: month, day: 15, out_of: super alex, escalation: 0}
goals: []
`;
    expect(findings(plan)).not.toContain("super-before-preservation-age");
  });

  it("is happy once they're old enough", () => {
    const plan = `
inflation: 0
birthdays: [{name: alex, born: 1950-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: super alex, balance: 5000000, kind: investment}
transfers:
  - {name: super drawdown, amount: 1000, every: month, day: 5, out_of: super alex, into: pay, escalation: 0}
goals: []
`;
    expect(findings(plan)).not.toContain("super-before-preservation-age");
  });
});

// The brief also listed `unbounded-envelope` -- an expense account with no
// outflow path. That rule doesn't survive contact with the model: an expense
// envelope having no outflow is exactly what `kind: expense` *means*. Its
// balance is cumulative spend, so money going in and never coming out is the
// normal, correct shape, and the rule would fire on every well-formed plan.
// The real version of that worry is a pot that should empty and doesn't,
// which is sinking-fund-trending.
describe("a pot that should empty and doesn't", () => {
  it("is caught for a sinking fund, and not for a spending envelope", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: car, balance: 0, kind: sinking}
  - {name: groceries, balance: 0, kind: expense}
transfers:
  - {name: car costs, amount: 200, every: week, day: sat, out_of: pay, into: car, escalation: 0}
  - {name: shopping, amount: 200, every: week, day: sat, out_of: pay, into: groceries, escalation: 0}
goals: []
`;
    const rules = findings(plan);
    expect(rules).toContain("sinking-fund-trending");
    expect(rules.filter((r) => r === "sinking-fund-trending")).toHaveLength(1);
  });
});

// The worked example is what an agent copies when it builds someone a plan.
// It used to end with super at -$2.76M and a pay account quietly banking
// years of unclaimed surplus, and nothing said so. It's been balanced, and
// this is what stops it drifting back: the start date matches the Phase 0
// snapshot, because a plan tuned to balance is tuned from a given date.
describe("the shipped example", () => {
  const EXAMPLE = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8");
  const SNAPSHOT = JSON.parse(readFileSync(new URL("./fixtures/example.expected.json", import.meta.url), "utf-8"));

  it("trips no rule at all", () => {
    const budget = load(EXAMPLE);
    const end = `${2026 + SNAPSHOT.years}-08-12`;
    const result = run(budget, SNAPSHOT.start, end);
    expect(lint(budget, result, SNAPSHOT.start, end)).toEqual([]);
  });
});
