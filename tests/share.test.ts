import { describe, it, expect } from "vitest";
import { gzipSync } from "node:zlib";
import { encodeShareHash, decodeShareHash, encodeShareUrl, decodeShareUrl } from "../src/share";
import { BROKEN_LINK_NOTICE, shareHashFor, stateFromShareHash } from "../src/ui/io";
import { initialState, stateToYamlText, type UIState } from "../src/state";

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

// An agent is handed a whole URL, not a fragment. Making it split on "#"
// itself is exactly the kind of small manual step that ends with someone
// reimplementing the codec badly -- which is the failure this whole round of
// work exists to stop.
describe("share URL round-trip", () => {
  const yamlText = "inflation: 0.03\naccounts:\n  - {name: pay, balance: 1000}\n";

  it("decodes a whole URL back to the exact text it encoded", async () => {
    expect(await decodeShareUrl(await encodeShareUrl(yamlText))).toBe(yamlText);
  });

  it("builds a link to the live site by default", async () => {
    expect(await encodeShareUrl(yamlText)).toMatch(/^https:\/\/envelopes\.lukeroh\.de\/#/);
  });

  it("takes a bare fragment too, so a half-copied link still works", async () => {
    const hash = await encodeShareHash(yamlText);
    expect(await decodeShareUrl(hash)).toBe(yamlText);
    expect(await decodeShareUrl(`#${hash}`)).toBe(yamlText);
  });

  it("says what's wrong when there's nothing to decode", async () => {
    await expect(decodeShareUrl("https://envelopes.lukeroh.de/")).rejects.toThrow(/no share data/i);
  });

  // The browser encodes with CompressionStream and Node's zlib decodes it, or
  // the other way about, depending on where the agent is standing. If those
  // two ever disagreed, a link made in the app would die in the CLI.
  it("reads a fragment gzipped by node's zlib rather than CompressionStream", async () => {
    const hash = gzipSync(Buffer.from(yamlText), { level: 9 })
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(await decodeShareUrl(`https://envelopes.lukeroh.de/#${hash}`)).toBe(yamlText);
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
    expect(restored.kind).toBe("plan");
    expect(stateToYamlText((restored as { state: UIState }).state)).toBe(stateToYamlText(state));
  });

  // A hash that won't decode is a broken link, not an absent one. Reporting
  // both as "nothing usable" is how a truncated link quietly showed somebody
  // the sample budget instead of the plan they were sent.
  it("tells a broken link apart from no link at all", async () => {
    expect(await stateFromShareHash("")).toEqual({ kind: "none" });

    const truncated = (await shareHashFor(initialState())).slice(0, 40);
    const broken = await stateFromShareHash(truncated);
    expect(broken.kind).toBe("broken");
    expect(BROKEN_LINK_NOTICE).toMatch(/truncated or corrupt/);
  });

  it("stays a short enough fragment to paste for the full example config", async () => {
    expect((await shareHashFor(initialState())).length).toBeLessThan(2000);
  });
});
