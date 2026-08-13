import { describe, expect, it } from "vitest";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { lint } from "../src/lint";

const START = "2026-01-01";

describe("sweep_above transfers", () => {
  it("moves only the amount above the retained clearing balance", () => {
    const budget = load(`
inflation: 0
accounts:
  - {name: pay, balance: 1000, kind: clearing}
  - {name: reserve, balance: 0, kind: saving}
transfers:
  - {name: sweep, sweep_above: 1000, every: month, day: 5, out_of: pay, into: reserve, escalation: 0}
goals: []
`);
    const result = run(budget, START, "2026-03-01");
    expect(result.balances.pay).toBeCloseTo(1000);
    expect(result.balances.reserve).toBeCloseTo(0);

    const withSurplus = load(`
inflation: 0
accounts:
  - {name: pay, balance: 1500, kind: clearing}
  - {name: reserve, balance: 0, kind: saving}
transfers:
  - {name: sweep, sweep_above: 1000, every: month, day: 5, out_of: pay, into: reserve, escalation: 0}
goals: []
`);
    const swept = run(withSurplus, START, "2026-02-01");
    expect(swept.balances.pay).toBeCloseTo(1000);
    expect(swept.balances.reserve).toBeCloseTo(500);
  });

  it("caps a sweep into a loan at the remaining principal", () => {
    const budget = load(`
inflation: 0
accounts:
  - {name: pay, balance: 1500, kind: clearing}
  - {name: mortgage, balance: 200, kind: loan}
transfers:
  - {name: sweep, sweep_above: 1000, every: month, day: 5, out_of: pay, into: mortgage, escalation: 0}
goals: []
`);
    const result = run(budget, START, "2026-02-01");
    expect(result.balances.pay).toBeCloseTo(1300);
    expect(result.balances.mortgage).toBeCloseTo(0);
  });

  it("rejects a sweep with a non-clearing source or a fixed amount", () => {
    expect(() => load(`
accounts:
  - {name: nest, balance: 100, kind: saving}
  - {name: pay, balance: 0, kind: clearing}
transfers:
  - {name: bad, sweep_above: 50, every: month, day: 1, out_of: nest, into: pay}
goals: []
`)).toThrow(/clearing/);
    expect(() => load(`
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: nest, balance: 0, kind: saving}
transfers:
  - {name: bad, amount: 10, sweep_above: 50, every: month, day: 1, out_of: pay, into: nest}
goals: []
`)).toThrow(/amount|sweep/);
  });

  it("can be stopped by the same named goal override as a fixed transfer", () => {
    const budget = load(`
inflation: 0
accounts:
  - {name: pay, balance: 1500, kind: clearing}
  - {name: reserve, balance: 0, kind: saving}
transfers:
  - {name: sweep, sweep_above: 1000, every: month, day: 5, out_of: pay, into: reserve, escalation: 0}
goals:
  - name: stop
    account: reserve
    target: 0
    by: 2026-01-03
    transfers:
      - {name: sweep, amount: 0}
`);
    const result = run(budget, START, "2026-02-01");
    expect(result.balances.reserve).toBeCloseTo(0);
  });

  it("gives a clearing surplus an explicit job so the accumulation finding clears", () => {
    const budget = load(`
inflation: 0
accounts:
  - {name: pay, balance: 1000, kind: clearing}
  - {name: reserve, balance: 0, kind: saving}
transfers:
  - {name: salary, amount: 2000, every: month, day: 5, into: pay, escalation: 0}
  - {name: sweep, sweep_above: 1000, every: month, day: 5, out_of: pay, into: reserve, escalation: 0}
goals: []
`);
    const start = "2026-01-01";
    const end = "2028-01-01";
    const result = run(budget, start, end);
    expect(lint(budget, result, start, end).some((finding) => finding.rule === "clearing-account-accumulating")).toBe(false);
  });
});
