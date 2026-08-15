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

/** Runs the console tool and hands back what it wrote, so a test drives it
 * the way a person does rather than calling its insides. stdout and stderr
 * stay apart because the tool deliberately puts them to different uses. */
async function capture(argv: string[]): Promise<{ out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
  const warn = vi.spyOn(console, "error").mockImplementation((...a) => void err.push(a.join(" ")));
  try {
    await runCli(argv);
  } finally {
    log.mockRestore();
    warn.mockRestore();
  }
  return { out: out.join("\n"), err: err.join("\n") };
}

/** The console tool as a whole, driven the way somebody actually drives it.
 * Everything above tests the formatter; this tests the thing with the
 * arguments, which is where the CLI and the library got to disagree about
 * what window they were even running. */
describe("runCli", () => {
  const path = join(tmpdir(), "envelopes-cli-test.yml");
  writeFileSync(path, CONFIG);


  it("prints usage for --help without being given a file at all", async () => {
    const { out } = await capture(["--help"]);
    expect(out).toContain("usage: envelopes");
    expect(out).toContain("--start");
  });

  it("runs from --start instead of today, so two variants stay the same experiment", async () => {
    expect((await capture(["--start", "2027-03-01", path])).out).toContain("from 2027-03-01");
    expect((await capture(["--start=2027-03-01", path])).out).toContain("from 2027-03-01");
  });

  it("ends where the library ends, given the same start", async () => {
    const { out } = await capture(["--json", "--start=2027-03-01", path]);
    expect(JSON.parse(out).end).toBe(simulate(CONFIG, { start: "2027-03-01" }).end);
  });

  it("runs to the youngest person turning 100, not a flat 40 years", async () => {
    const { out } = await capture(["--json", "--start=2027-03-01", path]);
    // alex is 42 on that date, so the horizon rounds 58 up to 60 years
    expect(JSON.parse(out).end).toBe(addDays("2027-03-01", Math.round(365.25 * 60)));
  });
});

/** A link is the one thing an agent hands over that it can't otherwise
 * check, and twice a good plan has arrived as a broken link. */
describe("link and decode", () => {
  const path = join(tmpdir(), "envelopes-link-test.yml");
  writeFileSync(path, CONFIG);

  it("prints a bare url on its own, with the character count out of the way on stderr", async () => {
    const { out, err } = await capture(["link", path]);
    expect(out.split("\n")).toHaveLength(1);
    expect(out).toMatch(/^https:\/\/envelopes\.lukeroh\.de\/#\S+$/);
    expect(err).toMatch(/\d+ characters/);
  });

  it("makes a link that decodes back to the very same plan", async () => {
    const { out } = await capture(["link", path]);
    const { out: yamlText } = await capture(["decode", out]);
    expect(yamlText).toBe(CONFIG);
  });

  it("says a truncated link is truncated instead of printing rubbish", async () => {
    const { out } = await capture(["link", path]);
    await expect(capture(["decode", out.slice(0, out.length - 20)])).rejects.toThrow(/truncated or mangled/);
  });

  it("says so when there is no plan in the url at all", async () => {
    await expect(capture(["decode", "https://envelopes.lukeroh.de/"])).rejects.toThrow(/won't decode/);
  });
});
