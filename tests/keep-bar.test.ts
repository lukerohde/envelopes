import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf-8");

describe("bookmark change notice", () => {
  it("is a slim top notice, not a full bookmark prompt", () => {
    expect(HTML).toContain("Bookmark URL has changed");
    expect(HTML).toContain("top: .8rem");
    expect(HTML).not.toContain('id="keepCopy"');
    expect(HTML).not.toContain('id="keepDismiss"');
  });
});
