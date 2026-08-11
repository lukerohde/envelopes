import { describe, it, expect } from "vitest";
import { sortMilestones } from "../src/milestones";

describe("sortMilestones", () => {
  it("orders reached milestones by which came first", () => {
    const entries = [
      { name: "super access at 60", year: 20 },
      { name: "pay off the house", year: 5 },
      { name: "retire at 55", year: 15 },
    ];
    expect(sortMilestones(entries).map((e) => e.name)).toEqual([
      "pay off the house", "retire at 55", "super access at 60",
    ]);
  });

  it("puts never-reached goals after every reached one, keeping their own order", () => {
    const entries = [
      { name: "reached later", year: 10 },
      { name: "never reached A", year: Infinity },
      { name: "reached first", year: 2 },
      { name: "never reached B", year: Infinity },
    ];
    expect(sortMilestones(entries).map((e) => e.name)).toEqual([
      "reached first", "reached later", "never reached A", "never reached B",
    ]);
  });
});
