import { describe, it, expect } from "vitest";
import { encodeShareHash, decodeShareHash } from "../src/share";
import { shareHashFor, stateFromShareHash } from "../src/ui/io";
import { initialState, stateToYamlText } from "../src/state";

describe("share hash round-trip", () => {
  it("decodes back to the exact text it encoded", async () => {
    const yamlText = "inflation: 0.03\naccounts:\n  - {name: pay, balance: 1000}\n";
    const hash = await encodeShareHash(yamlText);
    const decoded = await decodeShareHash(hash);
    expect(decoded).toBe(yamlText);
  });

  it("produces a URL-safe string -- no +, /, or = padding", async () => {
    const hash = await encodeShareHash("some: yaml\nwith: {a: 1, b: 2, c: [1, 2, 3]}\n");
    expect(hash).not.toMatch(/[+/=]/);
  });

  it("compresses a realistic config to something shorter than the raw text", async () => {
    const big = "transfers:\n" + "  - {name: repeat, amount: 100, every: month, out_of: a, into: b}\n".repeat(50);
    const hash = await encodeShareHash(big);
    expect(hash.length).toBeLessThan(big.length);
  });
});

// The address bar now tracks every edit, which is only worth anything if what
// it holds actually reconstructs the budget. A silently stale or unreadable
// fragment is the exact bug this replaced.
describe("shareHashFor", () => {
  it("round-trips a real edit back to the same budget", async () => {
    const state = initialState();
    state.accounts[0].balance = 12345;
    state.transfers[0].amount = 999;

    const restored = await stateFromShareHash(await shareHashFor(state));
    expect(restored).not.toBeNull();
    expect(stateToYamlText(restored!)).toBe(stateToYamlText(state));
  });

  it("stays a short enough fragment to paste for the full example config", async () => {
    expect((await shareHashFor(initialState())).length).toBeLessThan(2000);
  });
});
