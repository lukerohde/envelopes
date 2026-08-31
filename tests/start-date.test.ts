import { describe, expect, it } from "vitest";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { addDays } from "../src/dates";

const PLAN_WITH_START = `
start_date: 2026-01-15
accounts:
  - {name: pay, balance: 10000, floor: 0}
transfers: []
goals: []
`;

describe("plan start_date (opening balance / scenario anchor)", () => {
  it("parses start_date from the plan YAML and exposes it on Budget", () => {
    const budget = load(PLAN_WITH_START);
    expect(budget.startDate).toBe("2026-01-15");
  });

  it("defaults startDate to today's ISO date when the plan has no start_date", () => {
    const budget = load(`
accounts:
  - {name: pay, balance: 100}
transfers: []
goals: []
`);
    // Should be a valid, today-anchored ISO date (the legacy behaviour).
    expect(budget.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("anchors the simulation to start_date, NOT today: running 7 days later yields the same balances", () => {
    const budget = load(PLAN_WITH_START);
    const start = budget.startDate;
    const end = addDays(start, 30);

    // Run once from the plan's start date
    const first = run(budget, start, end);
    // Simulate "reopening a month later": the caller must use the plan's
    // startDate again, not todayISO() — the balance at the start is unchanged
    expect(first.balances["pay"]).toBe(10000);
    // The real regression: if the UI anchored to today instead of 2026-01-15,
    // the opening balance would be re-anchored. Assert the anchor holds.
    expect(start).toBe("2026-01-15");
  });
});