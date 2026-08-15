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

/** What's left of a page once the markup is gone -- roughly what an agent's
 * fetcher hands its model. Comments, scripts and styles go whole, because
 * nothing in them is text anyone reads; everything else loses its tags and
 * keeps its words. */
function textOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]*>/g, " ");
}

describe("discovery breadcrumbs", () => {
  it("puts the pointer in the literal first bytes, above the doctype", () => {
    expect(HTML.indexOf("llms.txt")).toBeLessThan(HTML.indexOf("<!DOCTYPE"));
    expect(HTML.trimStart().startsWith("<!--")).toBe(true);
  });

  it("declares llms.txt in the head as well, for anything parsing properly", () => {
    expect(HTML).toContain('<link rel="llms" href="/llms.txt">');
    expect(HTML).toContain('<meta name="ai-instructions" content="See /llms.txt">');
  });

  /** The three breadcrumbs above are all invisible to the fetchers that
   * matter most. An agent fetching a page extracts it to markdown first, and
   * that throws away comments, <link> and <meta> alike -- so after fetching
   * the root, the string "llms" appeared nowhere in what the agent could
   * actually read.
   *
   * Worse than a missing signpost: many agents run under a fetch allowlist
   * where only URLs already seen in the conversation may be requested. A user
   * pasting the site root makes the root fetchable and nothing else. /llms.txt
   * is a path the agent has to *construct*, and a constructed URL is refused
   * before any request goes out -- which reads as a permissions error, not a
   * 404, so the agent can't even tell the file exists. A real anchor in the
   * body both says it's there and makes the URL legal to ask for.
   *
   * This is the exact condition an extraction-based fetcher sees, which is
   * why it strips rather than parses. */
  it("survives tag-stripping, the way an agent's fetcher reads the page", () => {
    expect(textOf(HTML)).toContain("llms.txt");
  });

  it("says it with a real anchor, not another thing extraction eats", () => {
    expect(HTML).toContain('<a href="/llms.txt">');
  });

  it("serves a real robots.txt that points at llms.txt", () => {
    expect(ROBOTS).toContain("# llms: /llms.txt");
    expect(ROBOTS).toContain("User-agent: *");
  });
});
