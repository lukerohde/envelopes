/** llms.txt was mentioned exactly once in the whole origin: ~1400 chars into
 * the HTML, inside a textarea, inside a collapsed <details>. An agent that
 * fetches the page and skims the first screenful of markup would never see
 * it -- and the one that prompted this work never did.
 *
 * These check the source. The build is checked separately, by hand, because
 * a comment above <!DOCTYPE> is exactly the sort of thing an HTML transform
 * quietly eats.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../index.html", import.meta.url), "utf-8");
const ROBOTS = readFileSync(new URL("../public/robots.txt", import.meta.url), "utf-8");

describe("discovery breadcrumbs", () => {
  it("puts the pointer in the literal first bytes, above the doctype", () => {
    expect(HTML.indexOf("llms.txt")).toBeLessThan(HTML.indexOf("<!DOCTYPE"));
    expect(HTML.trimStart().startsWith("<!--")).toBe(true);
  });

  it("declares llms.txt in the head as well, for anything parsing properly", () => {
    expect(HTML).toContain('<link rel="llms" href="/llms.txt">');
    expect(HTML).toContain('<meta name="ai-instructions" content="See /llms.txt">');
  });

  it("serves a real robots.txt that points at llms.txt", () => {
    expect(ROBOTS).toContain("# llms: /llms.txt");
    expect(ROBOTS).toContain("User-agent: *");
  });
});
