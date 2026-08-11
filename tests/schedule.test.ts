import { describe, expect, it } from "vitest";
import { dates, fires } from "../src/schedule";

describe("fires -- week", () => {
  it("fires on the named weekday", () => {
    // 2026-08-09 is a Sunday
    expect(fires("week", "sun", "2026-08-09")).toBe(true);
    expect(fires("week", "sun", "2026-08-08")).toBe(false);
  });
});

describe("fires -- fortnight", () => {
  it("fires on the anchor date itself", () => {
    expect(fires("fortnight", "2026-08-05", "2026-08-05")).toBe(true);
  });

  it("fires exactly 14 days later", () => {
    expect(fires("fortnight", "2026-08-05", "2026-08-19")).toBe(true);
  });

  it("does not fire 7 days later", () => {
    expect(fires("fortnight", "2026-08-05", "2026-08-12")).toBe(false);
  });

  it("fires before the anchor too, on the same 14-day cadence", () => {
    expect(fires("fortnight", "2026-08-05", "2026-07-22")).toBe(true);
  });
});

describe("fires -- month", () => {
  it("fires on the given day of the month", () => {
    expect(fires("month", 16, "2026-08-16")).toBe(true);
    expect(fires("month", 16, "2026-08-15")).toBe(false);
  });

  it("clamps a day past the month's end to the last day", () => {
    // day 31 requested, February 2026 has 28 days
    expect(fires("month", 31, "2026-02-28")).toBe(true);
  });

  it("clamps to 29 in a leap-year February", () => {
    expect(fires("month", 31, "2028-02-29")).toBe(true);
    expect(fires("month", 31, "2028-02-28")).toBe(false);
  });
});

describe("fires -- year", () => {
  it("fires on the given month-day", () => {
    expect(fires("year", "12-15", "2026-12-15")).toBe(true);
    expect(fires("year", "12-15", "2026-12-14")).toBe(false);
  });

  it("clamps like month does, within the right month", () => {
    expect(fires("year", "02-30", "2026-02-28")).toBe(true);
    expect(fires("year", "02-30", "2028-02-29")).toBe(true);
  });
});

describe("fires -- once", () => {
  it("fires on its date", () => {
    expect(fires("once", "2030-03-14", "2030-03-14")).toBe(true);
  });

  it("fires on no other day, before or after", () => {
    expect(fires("once", "2030-03-14", "2030-03-13")).toBe(false);
    expect(fires("once", "2030-03-14", "2030-03-15")).toBe(false);
    expect(fires("once", "2030-03-14", "2031-03-14")).toBe(false);
  });

  it("fires exactly one day across a long run", () => {
    const got = dates("once", "2030-03-14", "2026-01-01", "2040-01-01");
    expect(got).toEqual(["2030-03-14"]);
  });
});

// `day` arrives from three places -- hand-written YAML, an LLM-written config,
// and the UI's own selects -- and each spells it slightly differently. Every
// one of these used to fail silently: no error, the transfer simply never
// fired, and money quietly went missing from the projection.
describe("fires -- how day is spelled", () => {
  it("takes a weekday in any case", () => {
    expect(fires("week", "Sat", "2026-08-08")).toBe(true);
    expect(fires("week", "SAT", "2026-08-08")).toBe(true);
    expect(fires("week", "sat", "2026-08-08")).toBe(true);
  });

  it("takes a day of the month as a string", () => {
    expect(fires("month", "16", "2026-08-16")).toBe(true);
    expect(fires("month", "31", "2026-02-28")).toBe(true);
  });

  it("takes a yearly date as a whole date, not just month-day", () => {
    expect(fires("year", "2030-12-25", "2026-12-25")).toBe(true);
    expect(fires("year", "2030-12-25", "2026-12-24")).toBe(false);
  });
});

describe("fires -- unknown frequency", () => {
  it("throws", () => {
    expect(() => fires("daily", 1, "2026-08-05")).toThrow(/unknown frequency/);
  });
});

describe("dates", () => {
  it("collects every firing date in the range, inclusive", () => {
    const got = dates("week", "sun", "2026-08-01", "2026-08-31");
    expect(got).toEqual(["2026-08-02", "2026-08-09", "2026-08-16", "2026-08-23", "2026-08-30"]);
  });
});

// A transfer can end up with no `day` at all: a goal that stops a transfer an
// earlier goal was meant to have started, applied before that goal has fired,
// creates one from nothing but a name and an amount. Nothing can be scheduled
// without a day, so it simply never fires -- crashing the whole simulation
// (and, in the browser, the whole page) is not the right answer.
describe("fires -- a transfer with no day", () => {
  it("never fires rather than throwing", () => {
    for (const every of ["once", "week", "fortnight", "month", "year"]) {
      expect(() => fires(every, null as unknown as string, "2026-08-05")).not.toThrow();
      expect(fires(every, null as unknown as string, "2026-08-05")).toBe(false);
    }
  });

  it("treats an empty string the same way", () => {
    expect(fires("fortnight", "", "2026-08-05")).toBe(false);
  });

  it("still rejects a frequency it doesn't know, day or no day", () => {
    expect(() => fires("daily", "2026-08-05", "2026-08-05")).toThrow(/unknown frequency/);
  });
});
