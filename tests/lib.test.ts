import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { simulate, report } from "../src/lib";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { addDays } from "../src/dates";

const EXAMPLE = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8");

// This is the entry point that gets bundled to dist/envelopes.mjs and served
// from the site for an AI agent to run. A bundle that quietly disagrees with
// the engine everything else uses would be worse than no bundle at all -- it
// would hand someone confident, wrong numbers.
describe("simulate", () => {
  it("gives the same answer as load() + run() called directly", () => {
    const start = "2026-01-01";
    const result = simulate(EXAMPLE, { start, years: 40 });
    const direct = run(load(EXAMPLE), start, addDays(start, Math.round(365.25 * 40)));

    expect(result.balances).toEqual(direct.balances);
    expect(result.completed).toEqual(direct.completed);
  });

  it("walks the number of years asked for", () => {
    const short = simulate(EXAMPLE, { start: "2026-01-01", years: 1 });
    expect(short.end).toBe(addDays("2026-01-01", 365));
  });

  it("keeps a history only for the accounts asked about", () => {
    const result = simulate(EXAMPLE, { start: "2026-01-01", years: 1, track: ["mortgage"] });
    expect(Object.keys(result.history)).toEqual(["mortgage"]);
    expect(result.history.mortgage.length).toBeGreaterThan(300);
  });

  it("runs the example's goals in the order the engine does", () => {
    const names = simulate(EXAMPLE, { start: "2026-01-01" }).completed.map(([name]) => name);
    expect(names).toContain("retire at 55");
    expect(names).toContain("Old & broke");
  });
});

describe("report", () => {
  it("prints milestones and closing balances", () => {
    const text = report(EXAMPLE, { start: "2026-01-01", years: 40 });
    expect(text).toContain("milestones:");
    expect(text).toContain("balances at the end of the run:");
    expect(text).toContain("retire at 55");
  });
});
