import { describe, expect, it } from "vitest";
import { dayForInput, dayFromInput, mobileTransferSummary, transferFieldsHTML } from "../src/ui/transfer-fields";

// A yearly transfer's `day` is "MM-DD" in the config -- the engine matches on
// month and day and never looks at a year. The On column is a date picker,
// which only deals in whole dates. Before this translation the picker wrote a
// full date straight into `day`, splitMonthDay() read "2030" as the month, and
// the transfer simply never fired -- no error, no warning, just missing money.
describe("dayForInput / dayFromInput -- year", () => {
  it("shows a month-day as a real date the picker can display", () => {
    expect(dayForInput("year", "12-25")).toBe("2000-12-25");
  });

  it("takes the picked date back down to month-day", () => {
    expect(dayFromInput("year", "2030-12-25")).toBe("12-25");
  });

  it("round-trips", () => {
    expect(dayFromInput("year", dayForInput("year", "07-01"))).toBe("07-01");
  });

  it("shows nothing when no month-day is set yet", () => {
    expect(dayForInput("year", "")).toBe("");
  });
});

describe("dayForInput / dayFromInput -- whole-date frequencies", () => {
  it("passes a once date through untouched, both ways", () => {
    expect(dayForInput("once", "2030-03-14")).toBe("2030-03-14");
    expect(dayFromInput("once", "2030-03-14")).toBe("2030-03-14");
  });

  it("passes a fortnight anchor date through untouched", () => {
    expect(dayForInput("fortnight", "2026-08-07")).toBe("2026-08-07");
    expect(dayFromInput("fortnight", "2026-08-07")).toBe("2026-08-07");
  });

  it("shows nothing for a value that isn't a whole date", () => {
    expect(dayForInput("fortnight", "Fri")).toBe("");
  });
});

describe("mobile transfer rows", () => {
  const fields = {
    name: "salary",
    from: "external income",
    to: "pay",
    mode: "fixed" as const,
    amount: 4500,
    every: "fortnight",
    day: "2026-08-07",
    escalates: false,
  };

  it("summarises the fields a phone user needs to scan", () => {
    expect(mobileTransferSummary(fields)).toBe("4,500 · fortnight");
  });

  it("renders a compact summary and a labelled expandable field set", () => {
    const html = transferFieldsHTML(fields, { nameEditable: true });
    expect(html).toContain('class="mobile-row-summary"');
    expect(html).toContain('data-mobile-amount="4,500"');
    expect(html).toContain('data-mobile-every="fortnight"');
    expect(html).toContain('data-mobile-toggle');
    expect(html).toContain('class="transfer-fields-grid"');
    expect(html).toContain('data-label="From"');
    expect(html).toContain('data-label="Inflation"');
    expect(html).toContain('data-field="mode"');
  });

  it("labels a sweep without adding another transfer-table column", () => {
    const html = transferFieldsHTML({ ...fields, mode: "sweep", amount: 1000 });
    expect(mobileTransferSummary({ ...fields, mode: "sweep", amount: 1000 })).toBe("above 1,000 · fortnight");
    expect(html).toContain('value="sweep" selected');
  });
});
