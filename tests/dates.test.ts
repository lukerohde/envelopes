import { describe, expect, it } from "vitest";
import { addDays, ageAt, clampToRange, daysBetween, horizonEnd, horizonYears, todayISO } from "../src/dates";

describe("addDays", () => {
  it("adds days within a month", () => {
    expect(addDays("2026-08-05", 3)).toBe("2026-08-08");
  });

  it("carries over a month boundary", () => {
    expect(addDays("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("carries over a leap-year February", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("carries over a non-leap-year February", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("subtracts with a negative count", () => {
    expect(addDays("2026-08-05", -5)).toBe("2026-07-31");
  });
});

describe("daysBetween", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-08-05", "2026-08-19")).toBe(14);
  });

  it("is negative when the second date is earlier", () => {
    expect(daysBetween("2026-08-19", "2026-08-05")).toBe(-14);
  });

  it("is zero for the same date", () => {
    expect(daysBetween("2026-08-05", "2026-08-05")).toBe(0);
  });
});

describe("clampToRange", () => {
  it("leaves a date inside the range alone", () => {
    expect(clampToRange("1984-03-15", "1900-01-01", "2026-08-11")).toBe("1984-03-15");
  });

  // typing "80" into a date input's year segment gives year 0080, and the
  // browser's calendar then opens there -- the actual bug this exists for
  it("pulls a two-digit year back up to the earliest allowed date", () => {
    expect(clampToRange("0080-03-15", "1900-01-01", "2026-08-11")).toBe("1900-01-01");
  });

  it("pulls a date past the end back down", () => {
    expect(clampToRange("2999-01-01", "2000-01-01", "2100-12-31")).toBe("2100-12-31");
  });

  it("keeps the range's own endpoints", () => {
    expect(clampToRange("1900-01-01", "1900-01-01", "2026-08-11")).toBe("1900-01-01");
    expect(clampToRange("2026-08-11", "1900-01-01", "2026-08-11")).toBe("2026-08-11");
  });

  // a goal with no date set yet is a real state -- don't invent one for it
  it("leaves an empty value empty", () => {
    expect(clampToRange("", "1900-01-01", "2026-08-11")).toBe("");
  });
});

describe("todayISO", () => {
  it("is a well-formed ISO date", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ageAt", () => {
  it("counts the birthday itself as the new age", () => {
    expect(ageAt("1984-03-15", "2026-03-15")).toBe(42);
  });

  it("is one less the day before the birthday", () => {
    expect(ageAt("1984-03-15", "2026-03-14")).toBe(41);
  });

  it("is one more the day after the birthday", () => {
    expect(ageAt("1984-03-15", "2026-03-16")).toBe(42);
  });
});

describe("horizonYears", () => {
  it("runs until the youngest person turns 100, rounded up to five years", () => {
    // youngest is 43 on this date -- 57 years to 100, so 60
    const people = [{ born: "1980-05-20" }, { born: "1983-01-10" }];
    expect(horizonYears(people, "2026-08-11")).toBe(60);
  });

  it("rounds up rather than to the nearest, so 100 is actually reached", () => {
    // exactly 45 -> 55 years to go, which is already a multiple of five
    expect(horizonYears([{ born: "1981-08-11" }], "2026-08-11")).toBe(55);
    // 44 -> 56 years, which must round up to 60, not down to 55
    expect(horizonYears([{ born: "1982-08-11" }], "2026-08-11")).toBe(60);
  });

  it("takes the youngest, not the first or the oldest", () => {
    const people = [{ born: "1950-01-01" }, { born: "2000-01-01" }, { born: "1975-01-01" }];
    expect(horizonYears(people, "2026-08-11")).toBe(75);
  });

  it("falls back to the console tool's 40 years when nobody has a birthday", () => {
    expect(horizonYears([], "2026-08-11")).toBe(40);
  });

  it("still gives something to look at for someone already past 100", () => {
    expect(horizonYears([{ born: "1900-01-01" }], "2026-08-11")).toBe(5);
  });
});

describe("horizonEnd", () => {
  it("is horizonYears turned into the actual last day of the run", () => {
    const people = [{ born: "1981-08-11" }]; // exactly 45 on this date -> 55 years
    expect(horizonEnd(people, "2026-08-11")).toBe(addDays("2026-08-11", Math.round(365.25 * 55)));
  });

  it("falls back the same way horizonYears does when nobody has a birthday", () => {
    expect(horizonEnd([], "2026-08-11")).toBe(addDays("2026-08-11", Math.round(365.25 * 40)));
  });
});
