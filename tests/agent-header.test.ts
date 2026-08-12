/** A share link's fragment never reaches the server, so when someone hands
 * an agent that link, the payload itself is the only channel that can tell
 * the agent anything. One did exactly that, decoded the fragment, and
 * reimplemented the whole projection in Python rather than running the real
 * engine -- which is the failure this header exists to head off.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { AGENT_HEADER, parseYamlIntoState, stateToYamlText, toBudget } from "../src/state";
import { load } from "../src/model";

const EXAMPLE = readFileSync(new URL("../src/example.yaml", import.meta.url), "utf-8");

describe("the agent pointer header", () => {
  const state = parseYamlIntoState(EXAMPLE);

  it("sits at the top of every YAML the app hands out", () => {
    expect(stateToYamlText(state).startsWith(AGENT_HEADER)).toBe(true);
  });

  it("points at llms.txt and at the real engine, not at reimplementing it", () => {
    expect(AGENT_HEADER).toContain("https://envelopes.lukeroh.de/llms.txt");
    expect(AGENT_HEADER).toContain("do NOT reimplement");
    expect(AGENT_HEADER).toContain("node envelopes-cli.mjs");
  });

  it("is comments only, so it can never change what the config means", () => {
    for (const line of AGENT_HEADER.trimEnd().split("\n")) {
      expect(line.startsWith("#")).toBe(true);
    }
  });

  it("survives the round-trip the UI actually uses", () => {
    const text = stateToYamlText(state);
    const reparsed = stateToYamlText(parseYamlIntoState(text));
    expect(reparsed).toEqual(text);
  });

  it("does not compound -- open the raw view, edit, re-dump, still one header", () => {
    let text = stateToYamlText(state);
    for (let i = 0; i < 3; i++) text = stateToYamlText(parseYamlIntoState(text));
    expect(text.split("envelopes plan").length - 1).toBe(1);
  });

  it("leaves the budget the engine builds identical", () => {
    const text = stateToYamlText(state);
    const withHeader = load(text);
    const without = load(text.slice(AGENT_HEADER.length));
    expect(withHeader).toEqual(without);
    expect(toBudget(state)).toEqual(without);
  });
});
