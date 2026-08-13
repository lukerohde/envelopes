/** The harness test. An agent handed a broken plan and `llms.txt` should be
 * able to fix it without a human catching anything -- and in round 1 that
 * failed seven times running, with every tool reporting success.
 *
 * These assert the three things that were missing:
 *   1. the target is stated, not just the faults
 *   2. the order is fixed, because a floor breach freezes everything after it
 *   3. what can't be measured says so, instead of showing green
 *
 * The last one matters most. A broken plan used to come back five ticks and
 * one cross, which reads as nearly right when in fact only one question had
 * actually been answered.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { checkPlan, formatCheck } from "../src/check";
import { addDays, horizonYears } from "../src/dates";

const START = "2026-08-13";

function check(yamlText: string) {
  const budget = load(yamlText);
  const end = addDays(START, Math.round(horizonYears(budget.birthdays, START) * 365.25));
  return { budget, check: checkPlan(budget, run(budget, START, end), START, end) };
}

const BROKEN = readFileSync(new URL("./fixtures/needs-balancing.yml", import.meta.url), "utf-8");
const EXAMPLE = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8");

describe("a plan that needs balancing", () => {
  it("fails on the cashflow first, because nothing after it is real", () => {
    const { check: c } = check(BROKEN);
    expect(c.criteria[0].name).toBe("the cashflow holds");
    expect(c.criteria[0].ok).toBe(false);
  });

  it("says which criteria it couldn't assess rather than passing them", () => {
    const { check: c } = check(BROKEN);
    const unassessed = c.criteria.filter((x) => x.ok === null);
    expect(unassessed.length).toBeGreaterThan(0);
    for (const u of unassessed) expect(u.detail).toContain("fix the cashflow first");
    // and nothing is quietly reported as passing while the plan is broken
    expect(c.criteria.filter((x) => x.ok === true)).toEqual([]);
  });

  it("ends with exactly one instruction, and it's the cashflow", () => {
    const { check: c } = check(BROKEN);
    expect(c.next).toContain("account-below-floor");
    expect(c.next).toContain("pay");
  });

  it("gives every finding something to actually do", () => {
    const { check: c } = check(BROKEN);
    expect(c.findings.length).toBeGreaterThan(0);
    for (const f of c.findings) {
      expect(f.fix.length, `${f.rule} has no fix`).toBeGreaterThan(30);
    }
  });

  it("puts the floor breach at the head of the list", () => {
    const { check: c } = check(BROKEN);
    expect(c.findings[0].rule).toBe("account-below-floor");
  });

  it("names the remaining fixture faults in deterministic order", () => {
    const { check: c } = check(BROKEN);
    expect(c.findings.map((finding) => finding.rule)).toEqual([
      "account-below-floor",
      "saving-below-inflation",
    ]);
    for (const finding of c.findings) expect(finding.fix.length).toBeGreaterThan(30);
  });
});

// Following the harness's own advice has to actually work. If the fix it
// names doesn't clear the fault it named, the advice is plausible rather
// than true, and an agent following it burns a round for nothing.
describe("the advice is known-good, not just plausible", () => {
  it("clears the cashflow fault when its fix is applied", () => {
    const before = check(BROKEN).check;
    expect(before.criteria[0].ok).toBe(false);

    // its fix: "raise the account's opening balance to carry the gap", and
    // move the big monthly transfers off the same day
    const fixed = BROKEN.replace("  - name: pay\n    balance: 200", "  - name: pay\n    balance: 9000");
    const after = check(fixed).check;
    expect(after.criteria[0].ok).toBe(true);
  });

  it("clears the below-inflation fault when its fix is applied", () => {
    const fixed = BROKEN.replace("  - name: pay\n    balance: 200", "  - name: pay\n    balance: 9000").replace(
      "    kind: saving\n    rate: 0.01",
      "    kind: saving\n    rate: 0.045",
    );
    const c = check(fixed).check;
    expect(c.criteria.find((x) => x.name === "savings beat inflation")!.ok).toBe(true);
  });
});

describe("the shipped example", () => {
  it("passes the cashflow criterion, so the rest can be measured at all", () => {
    const { check: c } = check(EXAMPLE);
    expect(c.criteria[0].ok).toBe(true);
    expect(c.criteria.some((x) => x.ok === null)).toBe(false);
  });

  it("lasts well into the eighties", () => {
    const { check: c } = check(EXAMPLE);
    const lasts = c.criteria.find((x) => x.name === "the money lasts")!;
    expect(lasts.ok).toBe(true);
    expect(lasts.detail).toContain("Old & broke");
  });
});

describe("review findings are advisory", () => {
  it("do not turn an intentional low-yield choice into a failing check", () => {
    const { check: c } = check(`
inflation: 0.03
accounts:
  - {name: pay, balance: 100000, kind: clearing}
  - {name: accessible, balance: 50000, kind: saving, rate: 0.01}
transfers: []
goals: []
`);
    const criterion = c.criteria.find((item) => item.name === "savings beat inflation")!;
    expect(criterion.status).toBe("review");
    expect(criterion.ok).toBe(true);
    expect(c.next).toBeNull();
    expect(c.reviews[0].severity).toBe("review");
  });
});

describe("the printed report", () => {
  it("states the horizon and everyone's age at it, so nobody guesses", () => {
    const { budget, check: c } = check(EXAMPLE);
    const text = formatCheck(c, budget);
    expect(text).toContain("plan check — to");
    expect(text).toMatch(/Alex \d+/);
  });

  it("marks what it couldn't assess distinctly from what passed", () => {
    const { budget, check: c } = check(BROKEN);
    const text = formatCheck(c, budget);
    expect(text).toContain("??");
    expect(text).toContain("FAIL");
  });
});
