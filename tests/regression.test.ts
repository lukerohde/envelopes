/** The whole-config guard. Every other test here checks one function; this
 * one runs the shipped example end to end and refuses to let its answers
 * move without someone saying so out loud.
 *
 * The snapshot is characterisation, not arithmetic anyone did by hand: it
 * records what the engine does today so that later phases -- account kinds,
 * flow subtotals, conjunctive goal triggers -- can prove they changed the
 * plumbing and not the numbers. When a change *should* move a milestone,
 * regenerate it deliberately:
 *
 *     npx tsx tests/fixtures/regenerate.ts
 *
 * and read the diff before committing it. A snapshot updated without reading
 * the diff is worse than no snapshot.
 *
 * Real household plans live in user-budgets/, untracked -- they never appear
 * here. src/example.yaml is the same shape (offset mortgage, bridge fund,
 * super, goals handing off in sequence) with numbers nobody has to keep
 * private.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { simulate } from "../src/lib";

const EXAMPLE = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8");
const EXPECTED = JSON.parse(readFileSync(new URL("./fixtures/example.expected.json", import.meta.url), "utf-8"));

// The run parameters live in the snapshot itself, so there's one copy of
// them and the fixture says what it's a snapshot *of*. Fixed dates, never
// todayISO() -- a snapshot taken from "today" fails tomorrow.
const { start, years } = EXPECTED;

describe("src/example.yaml, end to end", () => {
  it("reaches the same milestones on the same dates", () => {
    const { completed } = simulate(EXAMPLE, { start, years });
    expect(completed).toEqual(EXPECTED.completed);
  });

  it("closes on the same balances", () => {
    const { balances } = simulate(EXAMPLE, { start, years });
    for (const name of Object.keys(EXPECTED.balances)) {
      expect(balances[name]).toBeCloseTo(EXPECTED.balances[name], 2);
    }
  });

  it("has no account the snapshot doesn't know about", () => {
    const { balances } = simulate(EXAMPLE, { start, years });
    expect(Object.keys(balances).sort()).toEqual(Object.keys(EXPECTED.balances).sort());
  });
});
