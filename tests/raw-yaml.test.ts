import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
const io = readFileSync(new URL("../src/ui/io.ts", import.meta.url), "utf-8");

describe("raw YAML editing", () => {
  it("places the editor before the still-visible simulation", () => {
    expect(html.indexOf('id="rawSection"')).toBeLessThan(html.indexOf("<summary><h2>Simulation over time"));
  });

  it("keeps the last valid run while displaying an inline YAML error", () => {
    expect(io).toContain("Not valid YAML yet");
    expect(html).toContain('id="rawStatus"');
  });
});
