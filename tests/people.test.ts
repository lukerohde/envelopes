import { describe, expect, it } from "vitest";
import { personSummaryHTML } from "../src/ui/people";

describe("people age summaries", () => {
  it("keeps the person's name visible and offers an edit action", () => {
    const html = personSummaryHTML({ name: "Alex", born: "1980-05-20" }, "2026-08-11");
    expect(html).toContain("Alex");
    expect(html).toContain('data-edit');
    expect(html).toContain("46");
  });
});
