import { describe, expect, it } from "vitest";
import { load } from "../src/model";
import { run } from "../src/simulate";
import { formatReport } from "../src/report";

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
