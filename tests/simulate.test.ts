import { describe, expect, it } from "vitest";

import { load } from "../src/model";
import { run } from "../src/simulate";

const START = "2026-01-01";

// A goal can introduce a brand-new transfer when it fires. For a one-off --
// a lease balloon payment the day the lease ends, say -- there's no date you
// could sensibly type in advance: a balance- or age-triggered goal's
// completion date is whatever the simulation works out. So leaving `day` off
// a `once` override means "when this goal fires". It lands the day *after*
// completion because the day's transfer pass has already run by the time
// goals are checked (see run()'s loop).
const BALLOON = `
inflation: 0
accounts:
  - {name: pay, balance: 30000}
  - {name: lease, kind: loan, balance: 2000}
transfers:
  - {name: lease payment, amount: 1000, every: month, day: 1, out_of: pay, into: lease, escalation: 0}
goals:
  - name: lease ends
    account: lease
    target: 0
    transfers:
      - {name: lease payment, amount: 0}
      - {name: lease balloon, amount: 5000, every: once, out_of: pay}
`;

function budget(text: string) {
  return load(text);
}

describe("run -- growth", () => {
  it("an untouched account just compounds at its own rate", () => {
    const b = budget(`
accounts:
  - {name: nest egg, balance: 10000, kind: saving, rate: 0.06}
`);
    const end = "2027-01-01";
    const days = 365;
    const got = run(b, START, end).balances["nest egg"];
    const expected = 10000 * (1 + 0.06 / 365.25) ** days;
    expect(got).toBeCloseTo(expected, 6);
  });

  it("nothing after the end date is applied -- half-open interval", () => {
    const b = budget(`
accounts:
  - {name: nest egg, balance: 10000, kind: saving, rate: 0.06}
`);
    const got = run(b, START, START).balances;
    expect(got["nest egg"]).toBe(10000);
  });
});

describe("run -- transfers", () => {
  it("moves money out_of one account and into another on its own schedule", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 1000}
  - {name: groceries}
transfers:
  - {name: groceries, amount: 100, every: week, day: sun, out_of: pay, into: groceries}
`);
    // 2026-01-01 is a Thursday; first Sunday is 2026-01-04, then 01-11, 01-18 -- 3 transfers by 01-19
    const got = run(b, START, "2026-01-19").balances;
    expect(got.groceries).toBe(300);
    expect(got.pay).toBe(700);
  });

  it("a rhythm with no into leaves the household -- money just vanishes from out_of", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 1000}
transfers:
  - {name: bill, amount: 50, every: month, day: 5, out_of: pay}
`);
    const got = run(b, START, "2026-02-01").balances;
    expect(got.pay).toBe(950);
  });

  it("escalation compounds annually from the simulation's own start date", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 0}
transfers:
  - {name: salary, amount: 1000, every: fortnight, day: 2026-01-01, into: pay, escalation: 0.1}
`);
    // fires on day 0 (full 1000, no elapsed time) and again on day 14
    const got = run(b, START, "2026-01-16").balances;
    const secondAmount = 1000 * (1 + 0.1) ** (14 / 365.25);
    expect(got.pay).toBeCloseTo(1000 + secondAmount, 6);
  });

  it("a by-date goal's account never becomes a debt account, even though it's an unused field for that trigger", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 0}
transfers:
  - {name: salary, amount: 1000, every: fortnight, day: 2026-01-01, into: pay}
goals:
  - {name: irrelevant date, account: pay, target: 0, by: 2099-01-01}
`);
    // arriving salary must still add, not subtract, just because a goal
    // happens to name "pay" in a field it never actually reads
    const got = run(b, START, "2026-01-02").balances;
    expect(got.pay).toBe(1000);
  });

  it("money arriving at a debt-paying goal's account shrinks the balance, not grows it", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 1000}
  - {name: mortgage, balance: 500, kind: loan}
transfers:
  - {name: repayment, amount: 100, every: month, day: 5, out_of: pay, into: mortgage}
goals:
  - {name: payoff, account: mortgage, target: 0}
`);
    const got = run(b, START, "2026-02-01").balances;
    expect(got.mortgage).toBeLessThan(500);
  });
});

describe("run -- goals", () => {
  it("a date-triggered goal fires on its date, regardless of balance", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 0}
transfers:
  - {name: seed, amount: 100, every: fortnight, day: 2026-01-01, into: pot}
goals:
  - name: switch
    account: pot
    target: 999999
    by: 2026-01-15
    transfers:
      - {name: seed, amount: 0}
`, );
    const { completed } = run(b, START, "2026-02-01");
    expect(completed).toEqual([["switch", "2026-01-15"]]);
  });

  it("a balance-triggered goal counts UP when its target is above the starting balance", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 0, kind: saving}
transfers:
  - {name: seed, amount: 100, every: fortnight, day: 2026-01-01, into: pot}
goals:
  - {name: reached, account: pot, target: 200}
`);
    const { completed } = run(b, START, "2026-02-01");
    expect(completed).toEqual([["reached", "2026-01-15"]]);
  });

  it("a balance-triggered goal counts DOWN when its target is below the starting balance", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 200, kind: saving}
transfers:
  - {name: draw, amount: 100, every: fortnight, day: 2026-01-01, out_of: pot}
goals:
  - {name: drained, account: pot, target: 0}
`);
    const { completed } = run(b, START, "2026-02-01");
    expect(completed).toEqual([["drained", "2026-01-15"]]);
  });

  it("a goal that redirects an existing transfer by name replaces its fields", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 0}
  - {name: mortgage, balance: 0, kind: saving}
  - {name: savings, kind: saving}
transfers:
  - {name: repayment, amount: 100, every: fortnight, day: 2026-01-01, into: mortgage}
goals:
  - name: switch it
    account: mortgage
    target: 100
    transfers:
      - {name: repayment, into: savings}
`);
    // fires once into mortgage (day 0, ->100, goal reached same day, override applied),
    // second firing (day 14) should land in savings instead
    const got = run(b, START, "2026-01-16").balances;
    expect(got.mortgage).toBe(100);
    expect(got.savings).toBe(100);
  });

  it("a goal that names a new transfer starts it from then on", () => {
    const b = budget(`
accounts:
  - {name: pay, balance: 0}
  - {name: pot, kind: saving}
goals:
  - name: trigger
    account: pot
    target: 0
    by: 2026-01-05
    transfers:
      - {name: brand new, amount: 50, every: fortnight, day: 2026-01-05, into: pot}
`);
    // the override is added AFTER that day's transfers already ran, so "brand
    // new" -- despite sharing the goal's own trigger day -- first fires on
    // its own next 14-day occurrence (2026-01-19), not the day it's created
    const got = run(b, START, "2026-01-20").balances;
    expect(got.pot).toBe(50);
  });

  it("an override transfer with no escalation of its own defaults to the budget's inflation", () => {
    const b = budget(`
inflation: 0.05
accounts:
  - {name: pay, balance: 0}
  - {name: pot, kind: saving}
goals:
  - name: trigger
    account: pot
    target: 0
    by: 2026-01-01
    transfers:
      - {name: brand new, amount: 100, every: fortnight, day: 2026-01-15, into: pot}
`);
    const got = run(b, START, "2026-01-16").balances;
    // fires once on 2026-01-15, 14 days after start, escalated at the global 5% default
    const expected = 100 * (1 + 0.05) ** (14 / 365.25);
    expect(got.pot).toBeCloseTo(expected, 6);
  });

  it("a balance-triggered goal snaps to exactly the target, not whatever the day's transfers landed on", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 100, kind: saving}
transfers:
  - {name: draw, amount: 200, every: fortnight, day: 2026-01-01, out_of: pot}
goals:
  - {name: ran out, account: pot, target: 0}
`);
    // the draw takes pot to -100, past its target of 0 -- without the snap
    // it'd be left there instead of exactly at the target it reached
    const { balances, completed } = run(b, START, "2026-01-02");
    expect(completed).toEqual([["ran out", "2026-01-01"]]);
    expect(balances.pot).toBeCloseTo(0, 6);
  });

  it("reaching a goal doesn't stop the walk -- there's no way for a goal to do that anymore", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 0, kind: saving}
transfers:
  - {name: seed, amount: 100, every: fortnight, day: 2026-01-01, into: pot}
goals:
  - {name: milestone, account: pot, target: 100}
`);
    // three fortnightly firings land within [start, end): 01-01, 01-15, 01-29
    const got = run(b, START, "2026-02-01").balances;
    expect(got.pot).toBe(300);
  });
});

describe("run -- tracked history, for charting", () => {
  it("records the requested account's end-of-day balance across the whole run", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 0, kind: saving}
transfers:
  - {name: seed, amount: 100, every: fortnight, day: 2026-01-01, into: pot}
`);
    const { history } = run(b, START, "2026-01-03", ["pot"]);
    expect(history.pot).toEqual([
      ["2026-01-01", 100],
      ["2026-01-02", 100],
    ]);
  });

  it("only tracks the accounts asked for, not every account", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 0}
  - {name: other, balance: 0}
`);
    const { history } = run(b, START, "2026-01-02", ["pot"]);
    expect(Object.keys(history)).toEqual(["pot"]);
  });

  it("with no track list, history is empty -- no cost for callers who don't need it", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 0}
`);
    const { history } = run(b, START, "2026-01-02");
    expect(history).toEqual({});
  });
});

describe("run -- offset accounts", () => {
  it("a loan only earns interest on the balance an offset account hasn't covered", () => {
    const b = budget(`
accounts:
  - {name: mortgage, balance: 100000, kind: loan, rate: 0.06}
  - {name: offset, balance: 40000, kind: saving, offsets: mortgage}
`);
    const got = run(b, START, "2026-01-02").balances;
    // interest for one day, charged on 100000 - 40000, not the full 100000
    const expected = 100000 + (60000 * 0.06) / 365.25;
    expect(got.mortgage).toBeCloseTo(expected, 6);
  });

  it("an offset can erase a loan's interest entirely, but never charge negative interest", () => {
    const b = budget(`
accounts:
  - {name: mortgage, balance: 50000, kind: loan, rate: 0.06}
  - {name: offset, balance: 90000, kind: saving, offsets: mortgage}
`);
    const got = run(b, START, "2026-01-02").balances;
    expect(got.mortgage).toBe(50000);
  });

  it("an account nobody offsets just compounds normally", () => {
    const b = budget(`
accounts:
  - {name: pot, balance: 10000, rate: 0.06}
`);
    const got = run(b, START, "2026-01-02").balances;
    expect(got.pot).toBeCloseTo(10000 * (1 + 0.06 / 365.25), 6);
  });
});

describe("a goal introducing a one-off transfer", () => {
  it("fires the balloon once the goal completes, without being told a date", () => {
    const got = run(load(BALLOON), "2026-01-01", "2027-01-01");
    // 2000 of lease paid off over two monthly payments, then a 5000 balloon
    expect(got.balances.lease).toBe(0);
    expect(got.balances.pay).toBe(30000 - 2000 - 5000);
  });

  it("fires it exactly once, not every day after the goal", () => {
    const oneYear = run(load(BALLOON), "2026-01-01", "2027-01-01").balances.pay;
    const fiveYears = run(load(BALLOON), "2026-01-01", "2031-01-01").balances.pay;
    expect(fiveYears).toBe(oneYear);
  });

  it("does not fire before the goal completes", () => {
    // the second lease payment on 2026-02-01 is what clears it, so a run
    // stopping mid-January must not have paid the balloon
    const got = run(load(BALLOON), "2026-01-01", "2026-01-15").balances;
    expect(got.pay).toBe(30000 - 1000);
  });

  it("still honours an explicit date when one is given", () => {
    const dated = BALLOON.replace(
      "{name: lease balloon, amount: 5000, every: once, out_of: pay}",
      "{name: lease balloon, amount: 5000, every: once, day: 2026-06-15, out_of: pay}",
    );
    const before = run(load(dated), "2026-01-01", "2026-06-01").balances.pay;
    const after = run(load(dated), "2026-01-01", "2026-07-01").balances.pay;
    expect(before).toBe(30000 - 2000);
    expect(after).toBe(30000 - 2000 - 5000);
  });
});

describe("a goal stopping a transfer that doesn't exist yet", () => {
  // "retire" fires long before "pay off the house", so the transfer it tries
  // to zero has never been created. Ordinary mistake to make in a real
  // config; it must not take the simulation down with it.
  const OUT_OF_ORDER = `
inflation: 0
birthdays:
  - {name: alex, born: 1900-01-01}
accounts:
  - {name: pay, balance: 1000}
  - {name: mortgage, kind: loan, balance: 500000}
transfers:
  - {name: repayment, amount: 10, every: month, day: 5, out_of: pay, into: mortgage}
goals:
  - name: pay off the house
    account: mortgage
    target: 0
    transfers:
      - {name: freed-up saving, amount: 500, every: month, day: 5, out_of: pay}
  - name: retire
    account: pay
    target: 0
    by_age: {person: alex, turns: 55}
    transfers:
      - {name: freed-up saving, amount: 0}
`;

  it("runs instead of throwing", () => {
    expect(() => run(load(OUT_OF_ORDER), "2026-01-01", "2027-01-01")).not.toThrow();
  });

  it("and the phantom transfer moves no money", () => {
    const got = run(load(OUT_OF_ORDER), "2026-01-01", "2027-01-01").balances;
    expect(got.pay).toBe(1000 - 12 * 10);
  });
});
