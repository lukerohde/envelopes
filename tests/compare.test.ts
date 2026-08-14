import { describe, expect, it } from "vitest";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { compareOutcomes, formatImpact, type PlanOutcome } from "../src/compare";

function outcome(amount: number, fixed = false): PlanOutcome {
  const text = `
accounts:
  - {name: pay, balance: 1000, kind: clearing}
  - {name: nest, balance: 0, kind: saving}
transfers:
  - {name: income, amount: ${amount}, every: month, day: 1, into: pay, escalation: 0}
  - {name: save, amount: ${amount}, every: month, day: 2, out_of: pay, into: nest, escalation: 0}
goals:
  - {name: retire, account: nest, target: 1200${fixed ? ", by: 2027-01-01" : ""}, transfers: []}
`;
  const budget = load(text);
  const start = "2026-01-01";
  const end = "2028-01-01";
  return { budget, result: run(budget, start, end), start, end };
}

describe("compareOutcomes", () => {
  it("reports exact milestone movement without choosing a winner", () => {
    const comparison = compareOutcomes(outcome(100), outcome(200));
    const retire = comparison.milestones.find((item) => item.name === "retire")!;
    expect(retire.before).toBe("2026-12-02");
    expect(retire.after).toBe("2026-06-02");
    expect(retire.days).toBe(-183);
    expect(retire.direction).toBe("earlier");
    expect(comparison).not.toHaveProperty("winner");
  });

  it("marks fixed goals rather than treating them as levers", () => {
    const comparison = compareOutcomes(outcome(100, true), outcome(200, true));
    expect(comparison.milestones[0].fixed).toBe(true);
    expect(comparison.milestones[0].direction).toBe("unchanged");
  });

  it("keeps the browser copy neutral", () => {
    const text = formatImpact(compareOutcomes(outcome(100), outcome(200)));
    expect(text).toContain("retire");
    expect(text).toContain("earlier");
    expect(text).not.toMatch(/better|worse|winner/);
  });
});
