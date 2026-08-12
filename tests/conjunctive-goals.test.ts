/** "The bridge fund is empty AND Luke is 60" was unrepresentable. A goal took
 * one trigger: `by` won if it was set, and the balance target was ignored.
 * That makes the single most important guard in an early-retirement plan --
 * don't touch super until it's legally available, and don't stop the bridge
 * drawdown until it's actually run out -- something you can only approximate.
 *
 * Opt-in via `wait_for_both`, not by inferring AND from both fields being
 * present: the UI writes `account` and `target` on every goal it emits,
 * including date- and age-triggered ones, so inferring it would silently
 * change the meaning of every share link in existence.
 */

import { describe, expect, it } from "vitest";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { parseYamlIntoState, stateToYamlText } from "../src/state";

/** Alex turns 60 on 2040-01-01. The bridge fund empties well before that. */
const PLAN = (extra: string) => `
inflation: 0
birthdays: [{name: alex, born: 1980-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: bridge, balance: 24000, kind: saving}
  - {name: super, balance: 500000, kind: investment}
transfers:
  - {name: bridge drawdown, amount: 1000, every: month, day: 5, out_of: bridge, into: pay, escalation: 0}
goals:
  - name: super access
    account: bridge
    target: 0
    ${extra}
    transfers:
      - {name: bridge drawdown, amount: 0}
      - {name: super drawdown, amount: 1000, every: month, day: 5, out_of: super, into: pay, escalation: 0}
`;

function firedOn(yamlText: string): string | undefined {
  const { completed } = run(load(yamlText), "2026-01-01", "2050-01-01");
  return completed.find(([name]) => name === "super access")?.[1];
}

describe("one trigger, as before", () => {
  it("fires on the balance when there's no date", () => {
    expect(firedOn(PLAN(""))).toBe("2027-12-05"); // the 24th payment of $1,000
  });

  it("fires on the age and ignores the target, exactly as it always did", () => {
    expect(firedOn(PLAN("by_age: {person: alex, turns: 60}"))).toBe("2040-01-01");
  });
});

describe("wait_for_both", () => {
  it("waits for the later of the two -- the age, when the fund empties first", () => {
    const both = PLAN("by_age: {person: alex, turns: 60}\n    wait_for_both: true");
    expect(firedOn(both)).toBe("2040-01-01");
  });

  // The dangerous case: the age arrives but the money hasn't run out. Firing
  // then would stop the bridge drawdown while there's still money in it and
  // start drawing super early, which is the exact thing this guards.
  it("waits for the balance when the age comes first", () => {
    const rich = PLAN("by_age: {person: alex, turns: 55}\n    wait_for_both: true");
    // alex turns 55 in 2035, but $24,000 at $1,000/month is gone by 2028
    expect(firedOn(rich)).toBe("2035-01-01");
  });

  it("never fires if only one of the two is ever satisfied", () => {
    const plan = `
inflation: 0
birthdays: [{name: alex, born: 1980-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: bridge, balance: 1000000, kind: saving}
transfers:
  - {name: bridge drawdown, amount: 10, every: year, day: 1-1, out_of: bridge, into: pay, escalation: 0}
goals:
  - name: never
    account: bridge
    target: 0
    by_age: {person: alex, turns: 60}
    wait_for_both: true
    transfers: []
`;
    expect(firedOn(plan.replace("never", "super access"))).toBeUndefined();
  });
});

// A balance goal snaps its account to the target when it fires, to absorb the
// overshoot from checking once a day. With two conditions you can't know the
// balance crossed *today* -- it may have crossed years ago -- so snapping
// would silently invent or destroy real money.
describe("snapping to the target", () => {
  const overshoot = `
inflation: 0
birthdays: [{name: alex, born: 1980-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: fund, balance: 300000, kind: saving}
transfers:
  - {name: topup, amount: 1000, every: month, day: 5, out_of: pay, into: fund, escalation: 0}
goals:
  - name: milestone
    account: fund
    target: 100000
    ${"by_age: {person: alex, turns: 50}\n    wait_for_both: true"}
    transfers: []
`;

  it("still snaps a plain balance goal, absorbing a day's overshoot", () => {
    const budget = load(`
inflation: 0
birthdays: []
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: fund, balance: 0, kind: saving}
transfers:
  - {name: topup, amount: 3000, every: month, day: 5, out_of: pay, into: fund, escalation: 0}
goals:
  - {name: ten grand, account: fund, target: 10000, transfers: []}
`);
    // measured just after the crossing -- the topups keep running afterwards,
    // so a later reading wouldn't tell you whether it snapped
    const { balances } = run(budget, "2026-01-01", "2026-05-01");
    expect(balances["fund"]).toBe(10000);
  });

  it("leaves the balance alone for a conjunctive goal", () => {
    const { balances } = run(load(overshoot), "2026-01-01", "2032-01-01");
    // target is 100,000 but the fund holds far more by the time alex is 50.
    // Snapping would have thrown away the difference.
    expect(balances["fund"]).toBeGreaterThan(300000);
  });
});

describe("round-tripping through the UI", () => {
  it("survives being loaded and re-serialised, so editing can't silently drop it", () => {
    const yamlText = PLAN("by_age: {person: alex, turns: 60}\n    wait_for_both: true");
    const round = stateToYamlText(parseYamlIntoState(yamlText));
    expect(round).toContain("wait_for_both: true");
    expect(firedOn(round)).toBe(firedOn(yamlText));
  });

  it("doesn't add the field to goals that don't use it", () => {
    expect(stateToYamlText(parseYamlIntoState(PLAN("")))).not.toContain("wait_for_both");
  });
});
