import { describe, expect, it } from "vitest";
import { overrideRowHTML, setOverrideAmount } from "../src/ui/goals";
import type { UIState, UITransferOverride } from "../src/state";

const state: UIState = {
  inflation: 0.03,
  birthdays: [],
  accounts: [{ name: "super Luke", balance: 1, floor: 0, kind: "saving", rate: 0.06, offsets: null }],
  transfers: [{ name: "drawdown", amount: 1200, every: "fortnight", day: "2026-08-07", out_of: "super Luke", into: null, escalates: true }],
  goals: [{
    name: "Retire", trigger: "date", account: "super Luke", target: 0, by: "2040-01-01",
    byAgePerson: "", byAgeTurns: 65,
    waitForBoth: false, exit: false, editing: false,
    transfers: [{ name: "drawdown", out_of: "super Tennille" }], accounts: [],
  }],
};

describe("goal transfer overrides", () => {
  it("keeps omitted fields inherited instead of showing a false stopped zero", () => {
    const html = overrideRowHTML(state, state.goals[0], 0, "drawdown", true);
    expect(html).toContain('placeholder="inherits 1,200"');
    expect(html).not.toContain("stopped-mark");
    expect(html).not.toContain('value="0"');
  });

  it("keeps an amount edit in the inherited sweep mode", () => {
    const override: UITransferOverride = { name: "sweep" };
    setOverrideAmount(override, "600", "sweep");
    expect(override).toEqual({ name: "sweep", sweep_above: 600 });
  });

  it("inherits the transfer state left by an earlier goal", () => {
    const sweeping: UIState = {
      ...state,
      accounts: [{ name: "pay", balance: 10000, floor: 800, kind: "clearing", rate: 0, offsets: null }],
      transfers: [{ name: "sweep", amount: 0, sweep_above: 10000, every: "year", day: "08-14", out_of: "pay", into: null, escalates: true }],
      goals: [
        { ...state.goals[0], name: "Pay off the house", transfers: [{ name: "sweep", sweep_above: 12000, escalates: false }] },
        { ...state.goals[0], name: "Retire at 55", transfers: [{ name: "sweep" }] },
      ],
    };
    const html = overrideRowHTML(sweeping, sweeping.goals[1], 1, "sweep", true);
    expect(html).toContain('placeholder="inherits 12,000"');
    expect(html).toContain('data-inherited-value="false"');
  });

  it("allows a new goal transfer from a clearing account to become a sweep", () => {
    const withNewSweep: UIState = {
      ...state,
      accounts: [
        { name: "pay", balance: 10000, floor: 800, kind: "clearing", rate: 0, offsets: null },
        ...state.accounts,
      ],
      goals: [{
        ...state.goals[0],
        transfers: [{
          name: "new transfer", amount: 0, every: "once", day: "",
          out_of: "pay", into: "super Luke", escalates: true,
        }],
      }],
    };
    const html = overrideRowHTML(withNewSweep, withNewSweep.goals[0], 0, "new transfer", true);
    expect(html).toContain('value="sweep">Sweep</option>');
    expect(html).not.toContain('value="sweep" disabled');
  });
});
