import { describe, expect, it, vi } from "vitest";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { formatReport } from "../src/report";
import { runCli } from "../src/cli";
import { simulate } from "../src/lib";
import { addDays } from "../src/dates";

const CONFIG = `
accounts:
  - {name: pay, balance: 1000, floor: 0}
  - {name: nest egg, balance: 0, kind: saving}
transfers:
  - {name: salary, amount: 500, every: fortnight, day: fri, into: pay}
goals:
  - {name: first ten grand, account: nest egg, target: 10000, by: 2027-01-01}
birthdays:
  - {name: alex, born: 1984-03-15}
`;

describe("formatReport", () => {
  it("names the source path and start date up top", () => {
    const budget = load(CONFIG);
    const { balances, completed } = run(budget, "2026-01-01", "2026-01-02");
    const text = formatReport("some/config.yml", "2026-01-01", budget, balances, completed);
    expect(text).toContain("some/config.yml, from 2026-01-01");
  });

  it("lists each completed milestone with the date and every birthday's age on that date", () => {
    const budget = load(CONFIG);
    const { balances, completed } = run(budget, "2026-01-01", "2027-06-01");
    const text = formatReport("c.yml", "2026-01-01", budget, balances, completed);
    expect(text).toMatch(/first ten grand\s+2027-01-01\s+42/);
  });

  it("lists every account's final balance, sorted by name", () => {
    const budget = load(CONFIG);
    const { balances, completed } = run(budget, "2026-01-01", "2026-01-02");
    const text = formatReport("c.yml", "2026-01-01", budget, balances, completed);
    const nestEggLine = text.indexOf("nest egg");
    const payLine = text.indexOf("pay");
    expect(nestEggLine).toBeGreaterThan(-1);
    expect(payLine).toBeGreaterThan(nestEggLine); // "nest egg" sorts before "pay"
  });
});

/** The console tool as a whole, driven the way somebody actually drives it.
 * Everything above tests the formatter; this tests the thing with the
 * arguments, which is where the CLI and the library got to disagree about
 * what window they were even running. */
describe("runCli", () => {
  const path = join(tmpdir(), "envelopes-cli-test.yml");
  writeFileSync(path, CONFIG);

  function capture(argv: string[]): string {
    const lines: string[] = [];
    const log = vi.spyOn(console, "log").mockImplementation((...args) => {
      lines.push(args.join(" "));
    });
    try {
      runCli(argv);
    } finally {
      log.mockRestore();
    }
    return lines.join("\n");
  }

  it("prints usage for --help without being given a file at all", () => {
    const text = capture(["--help"]);
    expect(text).toContain("usage: envelopes");
    expect(text).toContain("--start");
  });

  it("runs from --start instead of today, so two variants stay the same experiment", () => {
    expect(capture(["--start", "2027-03-01", path])).toContain("from 2027-03-01");
    expect(capture(["--start=2027-03-01", path])).toContain("from 2027-03-01");
  });

  it("ends where the library ends, given the same start", () => {
    const json = JSON.parse(capture(["--json", "--start=2027-03-01", path]));
    expect(json.end).toBe(simulate(CONFIG, { start: "2027-03-01" }).end);
  });

  it("runs to the youngest person turning 100, not a flat 40 years", () => {
    const json = JSON.parse(capture(["--json", "--start=2027-03-01", path]));
    // alex is 42 on that date, so the horizon rounds 58 up to 60 years
    expect(json.end).toBe(addDays("2027-03-01", Math.round(365.25 * 60)));
  });
});
