import { describe, expect, it } from "vitest";
import { overrideRowHTML } from "../src/ui/goals";
import type { UIState } from "../src/state";

const state: UIState = {
  inflation: 0.03,
  birthdays: [],
  accounts: [{ name: "super Luke", balance: 1, floor: 0, kind: "saving", rate: 0.06, offsets: null }],
  transfers: [{ name: "drawdown", amount: 1200, every: "fortnight", day: "2026-08-07", out_of: "super Luke", into: null, escalates: true }],
  goals: [{
    name: "Retire", trigger: "date", account: "super Luke", target: 0, by: "2040-01-01",
    byAgePerson: "", byAgeTurns: 65, editing: false,
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
});
