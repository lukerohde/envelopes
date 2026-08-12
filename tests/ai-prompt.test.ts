/** The prompt is a pointer, not a payload -- the instructions live in
 * llms.txt, and the one thing the prompt has to carry that llms.txt can't
 * is *which plan*. It was static markup before this, so it told an agent
 * how to interview someone even when the person had a finished plan on
 * screen.
 */

import { describe, expect, it } from "vitest";
import { aiPromptFor, MAX_URL } from "../src/ui/ai-prompt";

const SITE = "https://envelopes.lukeroh.de/";
const YAML = "inflation: 0.03\naccounts:\n  - {name: pay, balance: 1000}\n";

describe("aiPromptFor", () => {
  it("asks for an interview when there's no plan yet", () => {
    const prompt = aiPromptFor(SITE, YAML);
    expect(prompt).toContain("interview me");
    expect(prompt).not.toContain("My plan:");
  });

  // The page boots from the example config and only writes a fragment on the
  // first real edit, so "no fragment" means "nothing of theirs is here yet".
  it("treats a bare '#' as no plan either", () => {
    expect(aiPromptFor(`${SITE}#`, YAML)).toContain("interview me");
  });

  it("carries the live URL once there's a plan in it", () => {
    const href = `${SITE}#H4sIAAAAAAAAA6tWSs5ILEpVslIqLskvSk0uUaoFAA`;
    const prompt = aiPromptFor(href, YAML);
    expect(prompt).toContain(`My plan: ${href}`);
    expect(prompt).not.toContain("interview me");
  });

  it("always points at llms.txt rather than restating it", () => {
    for (const href of [SITE, `${SITE}#H4sIAAAA`]) {
      expect(aiPromptFor(href, YAML)).toContain("https://envelopes.lukeroh.de/llms.txt");
    }
    // the old prompt explained the tool itself; that's llms.txt's job
    expect(aiPromptFor(SITE, YAML)).not.toContain("exact YAML format");
  });

  it("falls back to the YAML when the link is too long to paste, and says so", () => {
    const href = `${SITE}#${"H".repeat(MAX_URL)}`;
    const prompt = aiPromptFor(href, YAML);
    expect(prompt).toContain(YAML);
    expect(prompt).toContain("too long");
    expect(prompt).not.toContain(href);
  });

  it("prefers the link right up to the limit -- a link beats 200 lines of YAML", () => {
    const href = `${SITE}#${"H".repeat(MAX_URL - SITE.length - 1)}`;
    expect(href.length).toBe(MAX_URL);
    expect(aiPromptFor(href, YAML)).toContain(href);
  });
});
