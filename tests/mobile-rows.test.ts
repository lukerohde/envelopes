import { describe, expect, it } from "vitest";
import { accountSummaryText } from "../src/ui/accounts";

describe("mobile account row summaries", () => {
  it("keeps the account kind and balance visible before expansion", () => {
    expect(accountSummaryText({
      name: "offset",
      balance: 12500,
      kind: "saving",
      rate: 0.04,
      floor: 0,
      offsets: "mortgage",
    })).toBe("Saving · 12,500");
  });
});
