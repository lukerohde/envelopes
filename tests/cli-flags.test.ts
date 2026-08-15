/** Agents currently parse column-aligned text to find out what a plan does,
 * which means a padding change is a breaking change for them. And every
 * figure the report prints is nominal, so a super balance of $1.66M in 2038
 * reads as wealth when it's really about $1.16M in today's money -- the
 * single most misleading thing about the output.
 */

import { describe, expect, it } from "vitest";
import { parseArgs, deflate, formatReport, reportJson } from "../src/report";
import { load } from "../src/model";
import { run } from "../src/simulate";

const CONFIG = `
inflation: 0.03
birthdays:
  - {name: alex, born: 1984-03-15}
accounts:
  - {name: pay, balance: 1000, floor: 0}
  - {name: nest egg, balance: 0, kind: saving}
transfers:
  - {name: salary, amount: 500, every: fortnight, day: fri, into: pay}
goals:
  - {name: first ten grand, account: nest egg, target: 10000, by: 2027-01-01}
`;

function summary(): Parameters<typeof reportJson> {
  const budget = load(CONFIG);
  const { balances, completed } = run(budget, "2026-01-01", "2036-01-01");
  return ["c.yml", "2026-01-01", "2036-01-01", budget, balances, completed];
}

describe("parseArgs", () => {
  it("takes a bare path, same as it always did", () => {
    expect(parseArgs(["plan.yml"])).toEqual({ verb: null, path: "plan.yml", json: false, real: false, flows: false, help: false });
  });

  it("reads the flags in any order", () => {
    expect(parseArgs(["--json", "plan.yml"]).json).toBe(true);
    expect(parseArgs(["plan.yml", "--real"]).real).toBe(true);
    expect(parseArgs(["--real", "--json", "plan.yml"])).toEqual({ verb: null, path: "plan.yml", json: true, real: true, flows: false, help: false });
    expect(parseArgs(["--flows", "plan.yml"]).flows).toBe(true);
    expect(parseArgs(["lint", "--json", "plan.yml"])).toMatchObject({ verb: "lint", json: true, path: "plan.yml" });
    expect(parseArgs(["compare", "--json", "before.yml", "after.yml"])).toMatchObject({
      verb: "compare", json: true, path: "before.yml", path2: "after.yml",
    });
  });

  it("names the verb once, since only ever one of them is running", () => {
    expect(parseArgs(["link", "plan.yml"])).toMatchObject({ verb: "link", path: "plan.yml" });
    expect(parseArgs(["decode", "https://envelopes.lukeroh.de/#H4sIAAA"]).path).toBe("https://envelopes.lukeroh.de/#H4sIAAA");
  });

  it("refuses an unknown flag rather than treating it as a filename", () => {
    expect(() => parseArgs(["--yolo", "plan.yml"])).toThrow(/unknown option: --yolo/);
  });

  it("refuses no path at all", () => {
    expect(() => parseArgs(["--json"])).toThrow(/usage/i);
  });
});

describe("--help", () => {
  it("short-circuits before a path is required", () => {
    expect(parseArgs(["--help"])).toMatchObject({ help: true });
    expect(parseArgs(["-h"])).toMatchObject({ help: true });
  });

  it("wins even after a verb that would otherwise need a path", () => {
    expect(parseArgs(["check", "--help"]).help).toBe(true);
    expect(parseArgs(["compare", "--help"]).help).toBe(true);
  });
});

describe("--start", () => {
  it("takes the value as a separate argument", () => {
    expect(parseArgs(["--start", "2027-01-01", "plan.yml"]).start).toBe("2027-01-01");
  });

  it("also takes the value joined with =, since an agent will type either", () => {
    expect(parseArgs(["--start=2027-01-01", "plan.yml"]).start).toBe("2027-01-01");
  });

  it("leaves start undefined when not given", () => {
    expect(parseArgs(["plan.yml"]).start).toBeUndefined();
  });

  it("rejects a malformed date instead of quietly running with it", () => {
    expect(() => parseArgs(["--start", "not-a-date", "plan.yml"])).toThrow(/--start/);
    expect(() => parseArgs(["--start=01/01/2027", "plan.yml"])).toThrow(/--start/);
  });

  it("rejects --start with nothing after it", () => {
    expect(() => parseArgs(["plan.yml", "--start"])).toThrow(/--start/);
  });
});

describe("deflate", () => {
  it("leaves today's money alone", () => {
    expect(deflate(1000, 0.03, 0)).toBe(1000);
  });

  it("turns future dollars into what they'd buy now", () => {
    // 3% for 10 years: 1000 / 1.03^10
    expect(deflate(1000, 0.03, 10)).toBeCloseTo(744.09, 2);
  });

  it("does nothing when there's no inflation to take out", () => {
    expect(deflate(1000, 0, 25)).toBe(1000);
  });
});

describe("--real", () => {
  it("shrinks every balance and says which dollars these are", () => {
    const [path, start, end, budget, balances, completed] = summary();
    const nominal = formatReport(path, start, budget, balances, completed);
    const real = formatReport(path, start, budget, balances, completed, {
      real: { inflation: budget.inflation, years: 10 },
    });
    expect(nominal).toContain("balances at the end of the run:");
    expect(real).toContain("in today's dollars");
    expect(real).not.toEqual(nominal);
  });
});

describe("--json", () => {
  it("gives both nominal and real, so nobody has to pick up front", () => {
    const json = reportJson(...summary());
    expect(json.balances["pay"]).toHaveProperty("nominal");
    expect(json.balances["pay"]).toHaveProperty("real");
    expect(json.balances["pay"].real).toBeLessThan(json.balances["pay"].nominal);
  });

  it("names the milestones with dates and ages, not padded columns", () => {
    const json = reportJson(...summary());
    expect(json.milestones).toEqual([{ name: "first ten grand", date: "2027-01-01", ages: { alex: 42 } }]);
  });

  it("carries the run's own parameters, so a result can be reproduced", () => {
    const json = reportJson(...summary());
    expect(json.start).toBe("2026-01-01");
    expect(json.end).toBe("2036-01-01");
    expect(json.inflation).toBe(0.03);
  });

  it("survives JSON.stringify without losing anything", () => {
    const json = reportJson(...summary());
    expect(JSON.parse(JSON.stringify(json))).toEqual(json);
  });
});
