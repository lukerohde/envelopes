/** llms.txt is a promise made to somebody else's AI assistant, and nobody
 * runs it the way they'd run code -- so it can rot for months without a
 * single visible symptom. The failure this whole round of work came from
 * was an agent trusting a document over reality; the least we can do is
 * make the document match.
 *
 * These aren't prose tests. Each one pins a claim llms.txt makes that the
 * code could quietly stop honouring.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import * as bundle from "../src/lib";
import { ACCOUNT_KINDS } from "../src/model";

const LLMS = readFileSync(new URL("../public/llms.txt", import.meta.url), "utf-8");

/** The markdown table that follows a given heading line. There's more than
 * one table in here now, and matching "a row starting with a backticked
 * word" across all of them picks up account kinds as if they were exports. */
function tableAfter(marker: string): string[] {
  const rest = LLMS.slice(LLMS.indexOf(marker));
  const rows: string[] = [];
  for (const line of rest.split("\n")) {
    if (line.startsWith("|")) rows.push(line);
    else if (rows.length > 0) break;
  }
  return rows;
}

describe("llms.txt", () => {
  it("only advertises exports the bundle actually has", () => {
    // first cell only -- a description can mention a type in backticks
    // (`Budget`) that isn't a runtime export
    const documented = tableAfter("`envelopes.mjs` exports:")
      .map((row) => row.split("|")[1] ?? "")
      .flatMap((cell) => [...cell.matchAll(/`([a-zA-Z]+)[(`]/g)].map((m) => m[1]));
    expect(documented.length).toBeGreaterThan(8);
    for (const name of documented) {
      expect(bundle, `llms.txt documents ${name}`).toHaveProperty(name);
    }
  });

  it("documents exactly the account kinds the engine accepts", () => {
    const documented = tableAfter("| kind | for | should be true |")
      .flatMap((row) => [...row.matchAll(/^\| `([a-z]+)` \|/g)].map((m) => m[1]));
    expect(documented.sort()).toEqual([...ACCOUNT_KINDS].sort());
  });

  it("routes an agent that arrived with a link, not just one starting blank", () => {
    expect(LLMS).toContain("They handed you a link");
    expect(LLMS).toContain("You've been handed an existing plan");
  });

  it("tells them how to decode a share link both ways", () => {
    expect(LLMS).toContain("decodeShareUrl");
    expect(LLMS).toContain("gzip.decompress"); // the no-dependency Python fallback
  });

  it("closes the loop -- an edit that stays in the chat is not a change", () => {
    expect(LLMS).toContain("encodeShareUrl");
    expect(LLMS).toContain("minimal diffs");
  });

  it("no longer tells them not to build a share link, now that there's a function", () => {
    expect(LLMS).not.toContain("Don't try to construct a share link yourself");
  });

  // The worked example used to be a hand-maintained second copy of
  // src/example.yaml, and the two had already drifted apart -- different goal
  // contents, different account kinds. Whichever one an agent read, the other
  // was wrong.
  it("quotes src/example.yaml verbatim, so the two can't drift", () => {
    const example = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8").trim();
    expect(LLMS).toContain(example);
  });

  it("carries the review checklist as a checklist, not buried prose", () => {
    for (const failure of [
      "An account ending negative",
      "Savings below inflation",
      "A goal that never fires",
      "Super drawn before preservation age",
    ]) {
      expect(LLMS).toContain(failure);
    }
  });

  it("does not teach an agent to sweep a future cashflow buffer", () => {
    expect(LLMS).toContain("Growth a later phase draws back down is a future cashflow buffer");
    expect(LLMS).toContain("reduce the incoming drawdown before considering a sweep");
  });

  it("says the shipped example starts clean", () => {
    expect(LLMS).toContain("passes every mechanical check on first load");
    expect(LLMS).not.toContain("intentionally leaves one excess-cash finding");
  });

  it("explains how the example routes its surplus by phase", () => {
    expect(LLMS).toContain("starts by sweeping monthly surplus");
    expect(LLMS).toContain("redirects that same named sweep");
    expect(LLMS).toContain("retirement stops it");
  });

  // Round 2 put the intent interview in; round 3 found it in the wrong spot --
  // an unnumbered aside after "You've been handed an existing plan" had
  // already told the agent to start fixing things, so a numbered-list reader
  // walked straight past it. These pin the fix: it's step 1, both paths, not
  // an aside either could skip.
  it("opens both arrival paths with the intent interview as step 1", () => {
    const handedPlan = LLMS.slice(
      LLMS.indexOf("## You've been handed an existing plan"),
      LLMS.indexOf("## Starting from nothing"),
    );
    const fromScratch = LLMS.slice(LLMS.indexOf("## Starting from nothing"));
    expect(handedPlan).toMatch(/### 1\..*[Ii]nterview/);
    expect(fromScratch).toMatch(/### 1\..*[Ii]nterview/);
  });

  it("keeps the interview content in one shared place instead of copying it per path", () => {
    // A distinctive line from the interview's substance -- if this shows up
    // more than once, the two paths have drifted into two copies.
    const occurrences = LLMS.split("Which levers may change").length - 1;
    expect(occurrences).toBe(1);
  });

  it("tells the handed-a-link path to ask about intent too, not just the from-scratch one", () => {
    const handedLinkBullet = LLMS.slice(
      LLMS.indexOf("**They handed you a link**"),
      LLMS.indexOf("## Getting the engine"),
    );
    expect(handedLinkBullet.toLowerCase()).toContain("interview");
  });

  it("gates changing YAML on an explicit yes, not just on having asked", () => {
    expect(LLMS).toContain("get an explicit yes before you write or change any YAML");
  });

  it("says what to do when they won't be drawn on intent", () => {
    expect(LLMS).toContain("State the assumption you're making");
  });
});
