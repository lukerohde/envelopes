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
});
