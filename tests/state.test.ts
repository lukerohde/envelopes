import { describe, expect, it } from "vitest";
import { parseYamlIntoState, toBudget, removeAccount, renameAccount, renameTransfer, nextName, stateToYamlText, groupAccounts } from "../src/state";
import { load } from "../src/model";
import { initialState } from "../src/state";
import exampleYaml from "../src/example.yaml?raw";
import { run } from "../src/simulate";

const YAML = `
inflation: 0.03
birthdays:
  - {name: alex, born: 1980-05-20}
accounts:
  - {name: pay, balance: 1000, floor: 200}
  - {name: mortgage, kind: loan, balance: 5000, rate: 0.06}
  - {name: offset, kind: saving, offsets: mortgage, balance: 500}
transfers:
  - {name: salary, amount: 400, every: fortnight, day: 2026-01-01, into: pay}
  - {name: repayment, amount: 100, every: month, day: 5, out_of: pay, into: mortgage, escalation: 0}
goals:
  - name: payoff
    account: mortgage
    target: 0
    transfers:
      - {name: repayment, amount: 0}
  - name: retire
    account: pay
    target: 0
    by_age: {person: alex, turns: 55}
    transfers: []
`;

describe("parseYamlIntoState", () => {
  it("reads accounts, including kind and offsets", () => {
    const state = parseYamlIntoState(YAML);
    const mortgage = state.accounts.find((a) => a.name === "mortgage")!;
    expect(mortgage.kind).toBe("loan");
    const offset = state.accounts.find((a) => a.name === "offset")!;
    expect(offset.offsets).toBe("mortgage");
  });

  it("derives 'escalates' from whether escalation is zero", () => {
    const state = parseYamlIntoState(YAML);
    expect(state.transfers.find((t) => t.name === "salary")!.escalates).toBe(true);
    expect(state.transfers.find((t) => t.name === "repayment")!.escalates).toBe(false);
  });

  it("derives a goal's trigger type from which fields are present", () => {
    const state = parseYamlIntoState(YAML);
    expect(state.goals.find((g) => g.name === "payoff")!.trigger).toBe("balance");
    const retire = state.goals.find((g) => g.name === "retire")!;
    expect(retire.trigger).toBe("age");
    expect(retire.byAgePerson).toBe("alex");
    expect(retire.byAgeTurns).toBe(55);
  });

  it("preserves a sweep_above transfer through the UI state round-trip", () => {
    const state = parseYamlIntoState(`
accounts:
  - {name: pay, balance: 1000, kind: clearing}
  - {name: reserve, balance: 0, kind: saving}
transfers:
  - {name: sweep, sweep_above: 1000, every: month, day: 5, out_of: pay, into: reserve}
goals: []
`);
    expect(state.transfers[0].sweep_above).toBe(1000);
    expect(toBudget(state).transfers[0].sweepAbove).toBe(1000);
  });
});

describe("toBudget", () => {
  it("round-trips to a Budget that runs identically to loading the YAML directly", () => {
    const state = parseYamlIntoState(YAML);
    const fromState = toBudget(state);
    const fromYaml = load(YAML);

    const start = "2026-01-01";
    const end = "2027-01-01";
    const a = run(fromState, start, end);
    const b = run(fromYaml, start, end);
    expect(a.balances).toEqual(b.balances);
    expect(a.completed).toEqual(b.completed);
  });

  it("a by_age goal resolves to the same date whichever path it came from", () => {
    const state = parseYamlIntoState(YAML);
    const fromState = toBudget(state);
    const fromYaml = load(YAML);
    expect(fromState.goals.find((g) => g.name === "retire")!.by).toBe(
      fromYaml.goals.find((g) => g.name === "retire")!.by,
    );
  });
});

describe("nextName", () => {
  it("uses the base name when nothing has it", () => {
    expect(nextName("new account", [])).toBe("new account");
  });

  it("counts up past names already taken", () => {
    const taken = [{ name: "new account" }, { name: "new account 2" }];
    expect(nextName("new account", taken)).toBe("new account 3");
  });
});

describe("renameAccount", () => {
  it("renames the account itself", () => {
    const state = parseYamlIntoState(YAML);
    renameAccount(state, "mortgage", "home loan");
    expect(state.accounts.find((a) => a.name === "home loan")).toBeDefined();
    expect(state.accounts.find((a) => a.name === "mortgage")).toBeUndefined();
  });

  it("follows the name through a transfer's from and to", () => {
    const state = parseYamlIntoState(YAML);
    renameAccount(state, "pay", "everyday");
    expect(state.transfers.find((t) => t.name === "salary")!.into).toBe("everyday");
    expect(state.transfers.find((t) => t.name === "repayment")!.out_of).toBe("everyday");
  });

  it("follows the name through another account's offsets", () => {
    const state = parseYamlIntoState(YAML);
    renameAccount(state, "mortgage", "home loan");
    expect(state.accounts.find((a) => a.name === "offset")!.offsets).toBe("home loan");
  });

  it("follows the name through a goal's own transfer override", () => {
    const state = parseYamlIntoState(YAML);
    state.goals[0].transfers[0].out_of = "pay";
    renameAccount(state, "pay", "everyday");
    expect(state.goals[0].transfers[0].out_of).toBe("everyday");
  });

  it("follows the name through a goal's rate override and its balance trigger", () => {
    const state = parseYamlIntoState(YAML);
    state.goals[0].accounts.push({ name: "mortgage", rate: 0.05 });
    renameAccount(state, "mortgage", "home loan");
    expect(state.goals[0].accounts[0].name).toBe("home loan");
    expect(state.goals.find((g) => g.name === "payoff")!.account).toBe("home loan");
  });

  // two accounts sharing a name means every reference to it silently resolves
  // to whichever one comes first -- refuse rather than quietly make a mess
  it("refuses a name another account already has", () => {
    const state = parseYamlIntoState(YAML);
    expect(renameAccount(state, "pay", "mortgage")).toBe(false);
    expect(state.accounts.find((a) => a.name === "pay")).toBeDefined();
  });

  it("refuses a blank name", () => {
    const state = parseYamlIntoState(YAML);
    expect(renameAccount(state, "pay", "  ")).toBe(false);
    expect(state.accounts.find((a) => a.name === "pay")).toBeDefined();
  });

  it("leaves the resulting state loadable by the real engine", () => {
    const state = parseYamlIntoState(YAML);
    renameAccount(state, "mortgage", "home loan");
    expect(() => toBudget(state)).not.toThrow();
  });
});

describe("renameTransfer", () => {
  it("renames the transfer itself", () => {
    const state = parseYamlIntoState(YAML);
    renameTransfer(state, "repayment", "mortgage repayment");
    expect(state.transfers.find((t) => t.name === "mortgage repayment")).toBeDefined();
    expect(state.transfers.find((t) => t.name === "repayment")).toBeUndefined();
  });

  // a goal override keyed on the old name would silently stop applying
  it("follows the name into a goal's transfer override", () => {
    const state = parseYamlIntoState(YAML);
    renameTransfer(state, "repayment", "mortgage repayment");
    expect(state.goals[0].transfers[0].name).toBe("mortgage repayment");
  });

  it("refuses a name another transfer already has", () => {
    const state = parseYamlIntoState(YAML);
    expect(renameTransfer(state, "repayment", "salary")).toBe(false);
    expect(state.transfers.find((t) => t.name === "repayment")).toBeDefined();
  });

  it("refuses a blank name", () => {
    const state = parseYamlIntoState(YAML);
    expect(renameTransfer(state, "repayment", "")).toBe(false);
    expect(state.transfers.find((t) => t.name === "repayment")).toBeDefined();
  });

  it("keeps the goal override actually applying after the rename", () => {
    const state = parseYamlIntoState(YAML);
    renameTransfer(state, "repayment", "mortgage repayment");
    const budget = toBudget(state);
    const override = budget.goals.find((g) => g.name === "payoff")!.transfers[0];
    expect(override.name).toBe("mortgage repayment");
    expect(budget.transfers.find((t) => t.name === "mortgage repayment")).toBeDefined();
  });
});

describe("removeAccount", () => {
  it("clears the removed name out of every transfer's from/to, base and goal-override alike", () => {
    const state = parseYamlIntoState(YAML);
    removeAccount(state, "mortgage");
    expect(state.transfers.find((t) => t.name === "repayment")!.into).toBeNull();
    const override = state.goals.find((g) => g.name === "payoff")!.transfers.find((t) => t.name === "repayment")!;
    expect(override.into).toBeUndefined(); // was never set on the override itself, stays unset
  });

  it("clears offsets pointing at the removed account", () => {
    const state = parseYamlIntoState(YAML);
    removeAccount(state, "mortgage");
    expect(state.accounts.find((a) => a.name === "offset")!.offsets).toBeNull();
  });

  it("drops a goal's rate override for the removed account", () => {
    const state = parseYamlIntoState(YAML);
    state.goals[0].accounts.push({ name: "mortgage", rate: 0.05 });
    removeAccount(state, "mortgage");
    expect(state.goals[0].accounts.find((a) => a.name === "mortgage")).toBeUndefined();
  });

  it("reassigns a balance-trigger goal that targeted the removed account", () => {
    const state = parseYamlIntoState(YAML);
    removeAccount(state, "mortgage");
    const payoff = state.goals.find((g) => g.name === "payoff")!;
    expect(payoff.account).toBe(state.accounts[0].name);
  });

  it("actually removes the account itself", () => {
    const state = parseYamlIntoState(YAML);
    removeAccount(state, "mortgage");
    expect(state.accounts.find((a) => a.name === "mortgage")).toBeUndefined();
  });

  it("leaves the resulting state loadable by the real engine", () => {
    const state = parseYamlIntoState(YAML);
    removeAccount(state, "mortgage");
    expect(() => toBudget(state)).not.toThrow();
  });
});

// The lease-balloon case, end to end through the UI's own path: a goal
// introduces a one-off with no date, which has to survive being written to
// YAML and read back by the real engine as "fire when this goal fires".
describe("a goal-introduced one-off with no date", () => {
  const withBalloon = () => {
    const state = parseYamlIntoState(YAML);
    state.goals[0].transfers.push({
      // escalates: false -- a contracted balloon is a fixed amount, so the
      // assertion below can be an exact number rather than an inflated one
      name: "lease balloon", amount: 5000, every: "once", day: "", out_of: "pay", into: null, escalates: false,
    });
    return state;
  };

  it("leaves the blank date out of the YAML rather than writing an empty one", () => {
    const text = stateToYamlText(withBalloon());
    expect(text).toContain("lease balloon");
    expect(text).not.toMatch(/name: lease balloon[\s\S]{0,80}day: ''/);
  });

  it("survives a round-trip back into UI state", () => {
    const text = stateToYamlText(withBalloon());
    const back = parseYamlIntoState(text);
    const override = back.goals[0].transfers.find((t) => t.name === "lease balloon")!;
    expect(override.amount).toBe(5000);
    expect(override.every).toBe("once");
    expect(override.day).toBeUndefined();
  });

  it("actually fires in the engine once the goal completes", () => {
    const budget = toBudget(withBalloon());
    // the mortgage this goal watches takes about six years to clear, so the
    // window has to be long enough for the goal to actually fire
    const { balances, completed } = run(budget, "2026-01-01", "2040-01-01");
    expect(completed.map(([name]) => name)).toContain("payoff");
    const without = run(toBudget(parseYamlIntoState(YAML)), "2026-01-01", "2040-01-01").balances;
    expect(without.pay - balances.pay).toBeCloseTo(5000, 6);
  });
});

describe("groupAccounts", () => {
  const accounts = () => parseYamlIntoState(`
accounts:
  - {name: pay}
  - {name: mortgage, kind: loan}
  - {name: groceries}
  - {name: offset, kind: saving}
  - {name: car loan, kind: loan}
  - {name: super, kind: saving}
`).accounts;

  it("puts loans first, then savings, then spending", () => {
    expect(groupAccounts(accounts()).map((g) => g.label)).toEqual(["Loans", "Savings", "Spending"]);
  });

  it("keeps each group in the order the config listed them", () => {
    const groups = groupAccounts(accounts());
    expect(groups[0].accounts.map((a) => a.name)).toEqual(["mortgage", "car loan"]);
    expect(groups[1].accounts.map((a) => a.name)).toEqual(["offset", "super"]);
    expect(groups[2].accounts.map((a) => a.name)).toEqual(["pay", "groceries"]);
  });

  it("leaves out a group nothing belongs to", () => {
    const onlySpending = parseYamlIntoState("accounts:\n  - {name: pay}\n").accounts;
    expect(groupAccounts(onlySpending).map((g) => g.label)).toEqual(["Spending"]);
  });

  it("shows every account exactly once", () => {
    const all = groupAccounts(accounts()).flatMap((g) => g.accounts.map((a) => a.name));
    expect(all.sort()).toEqual(["car loan", "groceries", "mortgage", "offset", "pay", "super"]);
  });
});

// The UI never runs example.yaml directly -- it parses it into state, writes
// that back out as YAML, and loads *that*. The console tool and every test
// above read the YAML straight, so a field lost in the round-trip is
// invisible to all of them and shows up only as a crash in the browser.
describe("the shipped example survives the round-trip the UI actually uses", () => {
  it("every transfer still has a day the scheduler can read", () => {
    const budget = toBudget(initialState());
    for (const transfer of budget.transfers) {
      expect(transfer.day, `${transfer.name} (every: ${transfer.every})`).not.toBeNull();
    }
  });

  it("runs the full horizon without throwing", () => {
    expect(() => run(toBudget(initialState()), "2026-08-11", "2086-08-11")).not.toThrow();
  });

  it("gives the same answer as loading the YAML straight", () => {
    const direct = run(load(exampleYaml), "2026-08-11", "2086-08-11");
    const viaState = run(toBudget(parseYamlIntoState(exampleYaml)), "2026-08-11", "2086-08-11");
    expect(viaState.balances).toEqual(direct.balances);
    expect(viaState.completed).toEqual(direct.completed);
  });
});

// An override that only says `amount: 0` says nothing about inflation, so it
// has to inherit whatever the transfer it overrides already does. Reading a
// missing `escalation` key as "escalates" made every stop-this-transfer
// override display an inflation tick the config never asked for.
describe("an override that doesn't mention escalation", () => {
  const YAML_FIXED = `
accounts:
  - {name: pay, balance: 1000}
  - {name: pot, kind: saving}
transfers:
  - {name: feed, amount: 100, every: month, day: 5, out_of: pay, into: pot, escalation: 0}
goals:
  - name: stop it
    account: pot
    target: 500
    transfers:
      - {name: feed, amount: 0}
`;

  it("leaves escalates unset rather than guessing true", () => {
    const state = parseYamlIntoState(YAML_FIXED);
    expect(state.goals[0].transfers[0].escalates).toBeUndefined();
  });

  it("doesn't invent an escalation the config never had", () => {
    const text = stateToYamlText(parseYamlIntoState(YAML_FIXED));
    const goalPart = text.slice(text.indexOf("goals:"));
    expect(goalPart).not.toContain("escalation");
  });

  it("still reads an explicit escalation either way", () => {
    const on = parseYamlIntoState(YAML_FIXED.replace("{name: feed, amount: 0}", "{name: feed, amount: 5, escalation: 0.02}"));
    expect(on.goals[0].transfers[0].escalates).toBe(true);
    const off = parseYamlIntoState(YAML_FIXED.replace("{name: feed, amount: 0}", "{name: feed, amount: 5, escalation: 0}"));
    expect(off.goals[0].transfers[0].escalates).toBe(false);
  });

  it("changes nothing about what the engine does", () => {
    const budget = toBudget(parseYamlIntoState(YAML_FIXED));
    const direct = load(YAML_FIXED);
    const a = run(budget, "2026-01-01", "2031-01-01");
    const b = run(direct, "2026-01-01", "2031-01-01");
    expect(a.balances).toEqual(b.balances);
  });
});
