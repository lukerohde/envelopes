import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const combo = readFileSync(new URL("../src/ui/combo.ts", import.meta.url), "utf-8");

describe("account suggestions", () => {
  it("uses a document-level overlay instead of a goal-row child", () => {
    expect(combo).toContain("document.body.appendChild(list)");
  });

  it("offers external income as a real From choice, not an account to create", () => {
    expect(combo).toContain("External income (no source account)");
    expect(combo).toContain('input!.dataset.field === "from"');
  });

  it("shows the full account list when external income is the new-row default", () => {
    expect(combo).toContain('const query = typed.toLowerCase() === "external income" ? "" : typed;');
    expect(combo).toContain('input!.value.trim().toLowerCase() === "external income"');
    expect(combo).toContain("input!.select()");
  });
});
