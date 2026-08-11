import { describe, expect, it } from "vitest";
import { defaultScrubYear, simulationHorizonLabel } from "../src/ui/simulation";

describe("defaultScrubYear", () => {
  it("uses the final completed milestone, not the goals' configured order", () => {
    expect(defaultScrubYear([
      ["later", "2036-08-12"],
      ["earlier", "2031-08-12"],
    ], "2026-08-12", Infinity)).toBeCloseTo(10);
  });

  it("starts at today when no milestone has been reached", () => {
    expect(defaultScrubYear([], "2026-08-12", Infinity)).toBe(0);
  });

  it("uses the final milestone when a floor hit comes later", () => {
    expect(defaultScrubYear([
      ["retire", "2036-08-12"],
    ], "2026-08-12", 18)).toBeCloseTo(10);
  });

  it("uses the floor-hit date when it comes before the final milestone", () => {
    expect(defaultScrubYear([
      ["retire", "2036-08-12"],
    ], "2026-08-12", 8)).toBe(8);
  });
});

describe("simulationHorizonLabel", () => {
  it("shows the endpoint and every person's age there", () => {
    expect(simulationHorizonLabel([
      { name: "Alex", born: "1980-05-20" },
      { name: "Sam", born: "1990-05-20" },
    ], "2026-05-20", 64)).toBe("Simulating to May 2090<span class=\"sim-ages\">Alex 110 · Sam 100</span>");
  });
});
