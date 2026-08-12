import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const combo = readFileSync(new URL("../src/ui/combo.ts", import.meta.url), "utf-8");

describe("account suggestions", () => {
  it("uses a document-level overlay instead of a goal-row child", () => {
    expect(combo).toContain("document.body.appendChild(list)");
  });
});
