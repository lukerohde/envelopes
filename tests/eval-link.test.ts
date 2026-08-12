/** The eval hands an agent a share link, not a file -- because that's what a
 * real person does. Which means the link has to still be the plan it claims
 * to be. A stale one would keep passing while quietly testing something
 * else, and nobody would notice for months.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { decodeShareUrl } from "../src/share";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { checkPlan } from "../src/check";
import { addDays, horizonYears } from "../src/dates";

const FIXTURE = readFileSync(new URL("./fixtures/needs-balancing.yml", import.meta.url), "utf-8");
const LINK = readFileSync(new URL("../evals/needs-balancing.link", import.meta.url), "utf-8").trim();

/** The fixture carries a header explaining itself to whoever opens the repo.
 * That header must not travel in the link: the first eval run decoded it,
 * found text describing itself as a test, and had to reason its way past
 * that before it could start. The eval is meant to measure judgement about a
 * budget, not composure about a prompt. */
const withoutComments = (yaml: string): string =>
  yaml
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join("\n")
    .replace(/^\n+/, "");

describe("the eval link", () => {
  it("decodes to the fixture, minus the header that would give the game away", async () => {
    expect(await decodeShareUrl(LINK)).toBe(withoutComments(FIXTURE));
  });

  it("carries nothing describing itself as a test", async () => {
    const decoded = await decodeShareUrl(LINK);
    expect(decoded).not.toContain("#");
    expect(decoded.toLowerCase()).not.toContain("eval");
  });

  it("points at the real site, so an agent can follow llms.txt from it", () => {
    expect(LINK.startsWith("https://envelopes.lukeroh.de/#")).toBe(true);
  });

  // If the eval plan ever became a working plan, the eval would pass for
  // everyone and mean nothing.
  it("is still a plan that needs balancing", () => {
    const budget = load(FIXTURE);
    const start = "2026-08-13";
    const end = addDays(start, Math.round(horizonYears(budget.birthdays, start) * 365.25));
    const checked = checkPlan(budget, run(budget, start, end), start, end);
    expect(checked.next).not.toBeNull();
    expect(checked.criteria[0].ok).toBe(false);
  });
});
