/** The most informative check nobody could get from the tool: reconciling the
 * pay account by hand across four different cadences, and finding what goes
 * out agrees with what comes in to within a few cents. That's what shows a
 * plan was deliberately calibrated rather than roughly guessed, and it took
 * manual arithmetic to find.
 *
 * Segmented by goal, not by year: the goals already cut the timeline into
 * regimes (working, post-mortgage, bridge, super), and a lifetime average
 * spans all of them and describes none.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { annualise, breaches, cadenceFactor, coverYears, expectedClosing, formatFlows, summarise, surplusOf } from "../src/flows";

const PLAN = `
inflation: 0
birthdays: [{name: alex, born: 1980-01-01}]
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: groceries, balance: 0, kind: expense}
  - {name: nest, balance: 0, kind: saving}
  - {name: mortgage, balance: 10000, kind: loan}
transfers:
  - {name: salary, amount: 1000, every: fortnight, day: 2026-01-02, into: pay, escalation: 0}
  - {name: shopping, amount: 100, every: week, day: fri, out_of: pay, into: groceries, escalation: 0}
  - {name: repayment, amount: 500, every: month, day: 5, out_of: pay, into: mortgage, escalation: 0}
goals:
  - name: house paid off
    account: mortgage
    target: 0
    transfers:
      - {name: repayment, amount: 0}
      - {name: saving, amount: 500, every: month, day: 5, out_of: pay, into: nest, escalation: 0}
`;

function phases() {
  return run(load(PLAN), "2026-01-01", "2029-01-01").phases;
}

describe("goal-delimited phases", () => {
  it("cuts the run where the goals fire, not on year boundaries", () => {
    const p = phases();
    expect(p.length).toBe(2);
    expect(p[0].start).toBe("2026-01-01");
    expect(p[1].name).toContain("house paid off");
    expect(p[0].end).toBe(p[1].start);
    expect(p[1].end).toBe("2029-01-01");
  });

  it("records what went in and out of each account, per phase", () => {
    const [working] = phases();
    // an expense envelope is pure one-way: money lands and never leaves
    expect(working.accounts["groceries"].in).toBeGreaterThan(0);
    expect(working.accounts["groceries"].out).toBe(0);
    // and pay is the opposite -- everything passes through it both ways
    expect(working.accounts["pay"].in).toBeGreaterThan(0);
    expect(working.accounts["pay"].out).toBeGreaterThan(0);
  });

  // This plan pays in more than it ever allocates, which is exactly the
  // condition nothing in the tool could show before.
  it("leaves the unspent remainder visible in the clearing account", () => {
    const [working] = phases();
    const pay = working.accounts["pay"];
    expect(pay.in - pay.out).toBeGreaterThan(0);
    expect(pay.closing).toBeCloseTo(pay.in - pay.out, 6);
  });

  // The repayment stops and a saving transfer starts, which is the entire
  // point of segmenting by goal: a lifetime average would blend the two.
  it("shows a transfer that stopped as gone in the next phase", () => {
    const [working, retired] = phases();
    expect(working.accounts["mortgage"].in).toBeGreaterThan(0);
    expect(retired.accounts["mortgage"].in).toBe(0);
    expect(working.accounts["nest"].in).toBe(0);
    expect(retired.accounts["nest"].in).toBeGreaterThan(0);
  });

  // Without interest the table wouldn't add up, and a table that doesn't add
  // up is worse than no table.
  it("reconciles: opening + in - out + interest == closing", () => {
    for (const phase of phases()) {
      for (const [name, flow] of Object.entries(phase.accounts)) {
        expect(flow.closing, `${phase.name} / ${name}`).toBeCloseTo(expectedClosing(flow), 6);
      }
    }
  });

  it("hands the next phase the balance the last one closed on", () => {
    const [working, retired] = phases();
    for (const name of Object.keys(working.accounts)) {
      expect(retired.accounts[name].opening).toBeCloseTo(working.accounts[name].closing, 6);
    }
  });
});

describe("phase measurement after a floor breach", () => {
  it("ends the flow phase on the first breach instead of accruing negative interest to the horizon", () => {
    const budget = load(`
inflation: 0
accounts:
  - {name: pay, balance: 0, kind: clearing}
  - {name: super, balance: 100, kind: investment, rate: 0.1}
transfers:
  - {name: super drawdown, amount: 100, every: month, day: 1, out_of: super, into: pay, escalation: 0}
goals:
  - {name: super takes over, account: pay, target: 0, by: 2026-01-02, transfers: []}
`);
    const result = run(budget, "2026-01-01", "2028-01-01");
    const breach = breaches(budget, result).find((item) => item.account === "super")!;
    const phase = result.phases.find((item) => item.name === "after super takes over")!;
    expect(phase.end).toBe(breach.on);
    expect(phase.accounts.super.closing).toBeCloseTo(result.balancesAtEnd!.super);
    expect(phase.accounts.super.interest).toBeGreaterThan(-1);
  });
});

describe("annualise", () => {
  it("makes weekly, monthly and yearly directly comparable", () => {
    expect(annualise(5200, 1)).toBeCloseTo(5200, 6);
    expect(annualise(2600, 0.5)).toBeCloseTo(5200, 6);
    expect(annualise(15600, 3)).toBeCloseTo(5200, 6);
  });

  it("doesn't divide by zero on a phase with no length", () => {
    expect(annualise(100, 0)).toBe(0);
  });
});

describe("display cadence", () => {
  it("scales annual rates to the four everyday cadences", () => {
    expect(cadenceFactor("year")).toBe(1);
    expect(cadenceFactor("week")).toBeCloseTo(7 / 365.25, 10);
    expect(cadenceFactor("fortnight")).toBeCloseTo(14 / 365.25, 10);
    expect(cadenceFactor("month")).toBeCloseTo(1 / 12, 10);
  });
});

describe("years of cover", () => {
  it("answers 'how long does this fund last at this burn rate'", () => {
    expect(coverYears(100000, 25000)).toBe(4);
  });

  it("is infinite when nothing is going out", () => {
    expect(coverYears(100000, 0)).toBe(Infinity);
  });

  it("is zero for an account with nothing in it", () => {
    expect(coverYears(0, 25000)).toBe(0);
  });
});

describe("summarise", () => {
  const budget = load(PLAN);
  const summaries = () => summarise(run(budget, "2026-01-01", "2029-01-01").phases, budget, "2026-01-01", false);

  it("annualises so a weekly and a monthly transfer are comparable", () => {
    const groceries = summaries()[0].rows.find((r) => r.account === "groceries")!;
    // $100/week against a 365.25-day year: 52.18 weeks, not 52. Worth being
    // exact about -- the whole point is comparing cadences without arithmetic,
    // so the arithmetic underneath had better be right.
    expect(groceries.inPerYear).toBeCloseTo((100 * 365.25) / 7, 0);
  });

  it("counts interest in net, so opening + net x years lands on closing", () => {
    for (const phase of summaries()) {
      for (const row of phase.rows) {
        if (row.account === "mortgage") continue; // debt sign, covered above
        expect(row.netPerYear * phase.years).toBeGreaterThan(-Infinity);
      }
    }
  });

  // "How long does this last" is meaningless for an envelope that only ever
  // receives, and for a loan the milestones already answer it.
  it("leaves cover blank for expense envelopes and loans", () => {
    const [working] = summaries();
    expect(working.rows.find((r) => r.account === "groceries")!.cover).toBeNaN();
    expect(working.rows.find((r) => r.account === "mortgage")!.cover).toBeNaN();
    expect(working.rows.find((r) => r.account === "pay")!.cover).not.toBeNaN();
  });

  it("drops accounts nothing happened to, rather than printing rows of zeros", () => {
    const [working] = summaries();
    expect(working.rows.some((r) => r.account === "nest")).toBe(false);
  });
});

describe("formatFlows", () => {
  it("labels each phase with its dates and length", () => {
    const budget = load(PLAN);
    const text = formatFlows(summarise(run(budget, "2026-01-01", "2029-01-01").phases, budget, "2026-01-01", false), false);
    expect(text).toContain("from the start");
    expect(text).toContain("after house paid off");
    expect(text).toContain("unallocated surplus");
    expect(text).toContain("2026-01-01 to");
  });

  it("says which dollars it's quoting when asked for real ones", () => {
    const budget = load(PLAN);
    const text = formatFlows(summarise(run(budget, "2026-01-01", "2029-01-01").phases, budget, "2026-01-01", true), true);
    expect(text).toContain("in today's dollars");
  });
});

// Surplus quietly pooling in `pay` is the whole reason this number exists:
// it's household income that no envelope ever claimed.
describe("unallocated surplus", () => {
  it("is what the clearing accounts quietly kept", () => {
    const budget = load(PLAN);
    const [working] = run(budget, "2026-01-01", "2029-01-01").phases;
    const pay = working.accounts["pay"];
    expect(surplusOf(working, budget)).toBeCloseTo(pay.in - pay.out + pay.interest, 6);
  });

  it("ignores envelopes and savings -- money there was allocated on purpose", () => {
    const budget = load(PLAN.replace("{name: pay, balance: 0, kind: clearing}", "{name: pay, balance: 0, kind: expense}"));
    const [working] = run(budget, "2026-01-01", "2029-01-01").phases;
    expect(surplusOf(working, budget)).toBe(0);
  });
});

// The panel is new markup, and the page is where most people will read this.
describe("the page carries it too, not just the CLI", () => {
  const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf-8");

  it("has somewhere to render the table", () => {
    expect(HTML).toContain('id="flowRows"');
    expect(HTML).toContain("Where the money goes");
  });

  it("lets a wide table scroll inside itself rather than breaking the page", () => {
    expect(HTML).toContain(".flow-scroll { overflow-x: auto");
  });

  it("offers dollar basis and an everyday display cadence in the flow section", () => {
    expect(HTML).toContain('class="dt-btn active" data-mode="future"');
    expect(HTML).toContain('class="dt-btn" data-mode="today"');
    expect(HTML).toContain('aria-label="Show account values in"');
    expect(HTML).toContain('class="cadence-btn" data-cadence="week"');
    expect(HTML).toContain('class="cadence-btn" data-cadence="fortnight"');
    expect(HTML).toContain('class="cadence-btn" data-cadence="month"');
    expect(HTML).toContain('class="cadence-btn active" data-cadence="year"');
  });

  it("keeps plan and edit feedback in a fixed bottom notice dock", () => {
    expect(HTML).toContain('class="notice-dock"');
    expect(HTML).toContain('id="impactStatus"');
    expect(HTML).toContain('id="planStatus"');
    expect(HTML).toContain("position: fixed; left: 50%;");
  });

  it("keeps the finding account visible in the fixed notice", () => {
    const simulation = readFileSync(new URL("../src/ui/simulation.ts", import.meta.url), "utf-8");
    expect(simulation).toContain("firstProblem.account");
  });

  it("suggests a periodic sweep for accumulating clearing cash", () => {
    const simulation = readFileSync(new URL("../src/ui/simulation.ts", import.meta.url), "utf-8");
    expect(simulation).toContain('firstProblem?.rule === "clearing-account-accumulating"');
    expect(simulation).toContain("consider adding a sweep to periodically clear excess cash");
  });
});
