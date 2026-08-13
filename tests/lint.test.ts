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
import { breaches } from "../src/flows";
import { addDays, ageAt, horizonYears } from "../src/dates";

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

// There was an `account-ends-negative` rule here too, reporting the closing
// balance. It's gone, and deliberately: a floor defaults to 0, so anything
// ending negative went under its floor first. This rule catches the same
// plans years earlier and says something truer -- and reporting a balance
// from beyond the point a plan collapsed is quoting fiction.
describe("a fund drawn down until it's gone", () => {
  it("is caught, and dated to when it ran out rather than the horizon", () => {
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
    const result = run(budget, "2026-01-01", "2036-01-01");
    const findings = lint(budget, result, "2026-01-01", "2036-01-01");
    const finding = findings.find((f) => f.rule === "account-below-floor" && f.account === "super")!;
    // $1,000 at $500/month is gone in the third month, not in 2036
    expect(finding.detail).toContain("2026-03");
    expect(finding.detail).toContain("doesn't recover");
  });

  it("says nothing about a balance from after the plan collapsed", () => {
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
    const result = run(budget, "2026-01-01", "2036-01-01");
    for (const f of lint(budget, result, "2026-01-01", "2036-01-01")) {
      expect(f.detail).not.toContain("-59,500"); // where the arithmetic ends up
    }
  });
});

describe("clearing-account-accumulating", () => {
  it("catches income that no envelope ever claimed", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2000, every: fortnight, day: 2026-01-02, into: pay, escalation: 0}
  - {name: shopping, amount: 100, every: fortnight, day: 2026-01-02, out_of: pay, into: groceries, escalation: 0}
goals: []
`);
    const result = run(budget, "2026-01-01", "2046-01-01");
    const finding = lint(budget, result, "2026-01-01", "2046-01-01")
      .find((item) => item.rule === "clearing-account-accumulating")!;
    expect(finding.detail).toContain("from the start");
    expect(finding.detail).toContain("base Transfers");
  });

  it("does not call cash unused when a later phase consumes it", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 5000, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2000, every: fortnight, day: 2026-01-02, into: pay, escalation: 0}
  - {name: shopping, amount: 100, every: fortnight, day: 2026-01-02, out_of: pay, into: groceries, escalation: 0}
goals:
  - name: retire at 55
    account: pay
    target: 0
    by: 2027-01-01
    transfers:
      - {name: shopping, amount: 3900}
`);
    const result = run(budget, "2026-01-01", "2028-01-01");
    const finding = lint(budget, result, "2026-01-01", "2028-01-01").find((f) => f.rule === "clearing-account-accumulating");
    expect(finding).toBeUndefined();
  });

  it("points to goal overrides when that phase actually creates the surplus", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2000, every: fortnight, day: 2026-01-02, into: pay, escalation: 0}
  - {name: shopping, amount: 2000, every: fortnight, day: 2026-01-02, out_of: pay, into: groceries, escalation: 0}
goals:
  - name: retire at 55
    account: pay
    target: 0
    by: 2027-01-01
    transfers:
      - {name: shopping, amount: 100}
`);
    const result = run(budget, "2026-01-01", "2028-01-01");
    const finding = lint(budget, result, "2026-01-01", "2028-01-01").find((f) => f.rule === "clearing-account-accumulating")!;
    expect(finding.detail).toContain('after "retire at 55"');
    expect(finding.detail).toContain('transfer overrides under "retire at 55" in Goals');
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

// The rule that would have caught two separate bugs during this work: a
// travel fund spending from empty down to -$36,000, and a pay account that
// balanced annually while hitting its floor eight weeks in. Both were
// invisible to every check that looks only at closing balances -- which was
// every check there was. The page has always drawn this; nothing else knew.
describe("account-below-floor", () => {
  it("catches an account that dips under its floor mid-run and recovers", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 1000, floor: 800, kind: clearing}
  - {name: bills, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2400, every: month, day: 20, into: pay, escalation: 0}
  - {name: rates, amount: 2400, every: month, day: 5, out_of: pay, into: bills, escalation: 0}
goals: []
`;
    // ends every month back at 1,000, but the 5th comes before the 20th
    expect(findings(plan)).toContain("account-below-floor");
  });

  it("says how far under and when", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 1000, floor: 800, kind: clearing}
  - {name: bills, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2400, every: month, day: 20, into: pay, escalation: 0}
  - {name: rates, amount: 2400, every: month, day: 5, out_of: pay, into: bills, escalation: 0}
goals: []
`);
    const result = run(budget, "2026-01-01", "2028-01-01");
    const f = lint(budget, result, "2026-01-01", "2028-01-01").find((x) => x.rule === "account-below-floor")!;
    expect(f.account).toBe("pay");
    expect(f.detail).toMatch(/2026-0[12]-\d\d/);
  });

  it("points to the goal overrides active when the floor is breached", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 1000, floor: 800, kind: clearing}
  - {name: bills, balance: 0, kind: expense}
transfers:
  - {name: salary, amount: 2400, every: month, day: 20, into: pay, escalation: 0}
  - {name: rates, amount: 2400, every: month, day: 5, out_of: pay, into: bills, escalation: 0}
goals:
  - {name: pay off the house, account: pay, target: 0, by: 2026-01-02, transfers: []}
`);
    const result = run(budget, "2026-01-01", "2028-01-01");
    const finding = lint(budget, result, "2026-01-01", "2028-01-01").find((f) => f.rule === "account-below-floor")!;
    expect(finding.detail).toContain('transfer overrides under "pay off the house" in Goals');
  });

  it("leaves an account that stays above its floor alone", () => {
    expect(findings(clean())).not.toContain("account-below-floor");
  });

  // A loan starts high and is paid down to zero; that isn't a breach.
  it("doesn't flag a loan paying itself off", () => {
    const plan = `
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: mortgage, balance: 10000, floor: 0, kind: loan}
transfers:
  - {name: salary, amount: 500, every: month, day: 1, into: pay, escalation: 0}
  - {name: repayment, amount: 500, every: month, day: 5, out_of: pay, into: mortgage, escalation: 0}
goals:
  - {name: paid off, account: mortgage, target: 0, transfers: []}
`;
    expect(findings(plan)).not.toContain("account-below-floor");
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

// The worked example is what an agent copies when it builds someone a plan,
// so what it demonstrates matters. It should hold together through the
// working years and the bridge, and then reach its explicit terminal boundary
// somewhere in the eighties -- because inflation eats every super balance
// eventually, and pretending otherwise would need either a fortune or
// unrealistic spending. Where it ends is the interesting question, and it's
// left to the reader.
describe("the shipped example", () => {
  const EXAMPLE = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8");

  function atPageHorizon() {
    const budget = load(EXAMPLE);
    // the same window the page uses: youngest person turning 100
    const start = "2026-08-13";
    const end = addDays(start, Math.round(horizonYears(budget.birthdays, start) * 365.25));
    return { budget, start, end, result: run(budget, start, end) };
  }

  it("demonstrates early retirement carried by a bridge fund", () => {
    const { result } = atPageHorizon();
    const names = result.completed.map(([n]) => n);
    expect(names).toContain("retire at 55");
    expect(names).toContain("super takes over");
    // the bridge fund carries the years between retiring and super unlocking
    const retire = result.completed.find(([n]) => n === "retire at 55")![1];
    const superOn = result.completed.find(([n]) => n === "super takes over")![1];
    expect(superOn > retire).toBe(true);
  });

  // The example declares the end of its useful projection explicitly. A pay
  // account hitting the floor means the cashflow never worked; super reaching
  // this terminal balance is the honest answer to the question the tool is
  // asked, without turning the example into an out-of-box failure.
  it("ends at the declared super terminal balance, not a floor breach", () => {
    const { budget, result } = atPageHorizon();
    expect(result.endedOn).not.toBeNull();
    expect(result.balances.super).toBe(1000);
    expect(breaches(budget, result)).toEqual([]);
  });

  it("holds together until well into the eighties", () => {
    const { budget, result } = atPageHorizon();
    const born = budget.birthdays[0].born;
    expect(result.endedOn).not.toBeNull();
    expect(ageAt(born, result.endedOn!)).toBeGreaterThanOrEqual(80);
  });

  // Sinking funds that only fill, savings losing to inflation, a goal that
  // never fires -- those are modelling mistakes and the example has none.
  //
  // It does still carry one `clearing-account-accumulating`, and that is
  // recorded here rather than tuned away or quietly excluded. The pay
  // account peaks around $80k in the years before the mortgage clears.
  // Pushing that surplus anywhere makes something else worse: into the
  // offset and the bridge years starve; into super and the plan lasts
  // longer, so the retirement-side over-draw has more years to pool and the
  // peak goes *up*. The knobs are coupled and this was tuned by hand, which
  // is precisely the thing the repo doesn't yet give an agent a method for.
  //
  // Pinned to one finding on one account so it can't quietly grow.
  it("has one known leak, and no others", () => {
    const { budget, result, start, end } = atPageHorizon();
    const other = lint(budget, result, start, end).filter((f) => f.rule !== "account-below-floor");
    expect(other.map((f) => `${f.rule}:${f.account}`)).toEqual(["clearing-account-accumulating:pay"]);
    expect(other[0].detail).toContain('after "retire at 55"');
    expect(other[0].detail).toContain("reduce that incoming transfer");
    expect(other[0].detail).not.toContain("base Transfers");
    expect(other[0].detail).not.toContain('under "pay off the house"');
  });

  it("proves the pre-house balance is needed by showing that sweeping it causes the later floor breach", () => {
    const { budget, start, end } = atPageHorizon();
    budget.transfers.push({
      name: "clear excess pay", amount: 0, sweepAbove: 10000,
      every: "year", day: "08-14", outOf: "pay", into: "early retirement",
      escalation: budget.inflation,
    });
    budget.goals.find((goal) => goal.name === "pay off the house")!.transfers.push({
      name: "clear excess pay", amount: 0,
    });
    const result = run(budget, start, end);
    expect(breaches(budget, result)[0]).toMatchObject({ account: "pay", on: "2033-03-05" });
  });
});
