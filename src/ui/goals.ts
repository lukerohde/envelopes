import { nextName, renameTransfer, type TriggerType, type UIAccountOverride, type UIGoal, type UIState, type UITransfer, type UITransferOverride } from "../state";
import { dayForEvery, transferFieldsHTML, transferHeadHTML, wireTransferFieldRow, type RowFields } from "./transfer-fields";
import { initCombos } from "./combo";
import { confirmRemove, removeButtonHTML } from "./remove-button";
import { wireDateClamp } from "./date-input";
import { EARLIEST_PLAN_DATE, LATEST_PLAN_DATE } from "../dates";

function findTransfer(state: UIState, name: string): UITransfer | undefined {
  for (const transfer of state.transfers) {
    if (transfer.name === name) return transfer;
  }
  return undefined;
}

function findOverride(goal: UIGoal, name: string): UITransferOverride | undefined {
  for (const override of goal.transfers) {
    if (override.name === name) return override;
  }
  return undefined;
}

function findAccountOverride(goal: UIGoal, name: string): UIAccountOverride | undefined {
  for (const override of goal.accounts) {
    if (override.name === name) return override;
  }
  return undefined;
}

/** A no-entry sign on a row whose amount this goal drops to zero. Sized to
 * one character so the Name column keeps its width. */
const STOPPED_MARK =
  '<span class="stopped-mark" title="Stops when this goal completes" aria-label="Stops when this goal completes">' +
  '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" ' +
  'stroke-width="1.8"><circle cx="8" cy="8" r="6.2"/><path d="M3.6 12.4 12.4 3.6"/></svg></span>';

function triggerText(goal: UIGoal): string {
  if (goal.trigger === "balance") return `${goal.account} reaches ${goal.target}`;
  if (goal.trigger === "date") return goal.by ? `on ${goal.by}` : "pick a date";
  return `${goal.byAgePerson} turns ${goal.byAgeTurns}`;
}

function blankTransfer(name: string): UITransfer {
  return { name, amount: 0, every: "fortnight", day: "", out_of: null, into: null, escalates: true };
}

function applyOverride(transfer: UITransfer, override: UITransferOverride): UITransfer {
  const next = { ...transfer };
  const has = (key: keyof UITransferOverride): boolean => Object.prototype.hasOwnProperty.call(override, key);
  if (has("every")) next.every = override.every!;
  if (has("day")) next.day = override.day!;
  if (has("out_of")) next.out_of = override.out_of ?? null;
  if (has("into")) next.into = override.into ?? null;
  if (has("escalates")) next.escalates = override.escalates!;
  if (has("amount")) {
    next.amount = override.amount!;
    delete next.sweep_above;
  }
  if (has("sweep_above")) {
    next.amount = 0;
    next.sweep_above = override.sweep_above;
  }
  return next;
}

// What a transfer's fields are right before a given goal runs: start with
// the base transfer, then apply every earlier goal in order. A goal override
// changes the live transfer left by the previous phase; it does not jump back
// to the original base settings. A transfer introduced by a goal starts from
// the engine's own defaults and follows the same path.
function resolveBase(state: UIState, goalIndex: number, name: string): UITransfer {
  const base = findTransfer(state, name);
  let resolved = base ? { ...base } : blankTransfer(name);
  for (let i = 0; i < goalIndex; i++) {
    const override = findOverride(state.goals[i], name);
    if (override) resolved = applyOverride(resolved, override);
  }
  return resolved;
}

function toRowFields(state: UIState, base: UITransfer, override: UITransferOverride | undefined): RowFields {
  const value = <T>(key: keyof UITransferOverride, fallback: T): T =>
    override && Object.prototype.hasOwnProperty.call(override, key) ? override[key] as T : fallback;
  let amount = base.sweep_above ?? base.amount;
  if (override && Object.prototype.hasOwnProperty.call(override, "sweep_above")) amount = override.sweep_above!;
  else if (override && Object.prototype.hasOwnProperty.call(override, "amount")) amount = override.amount!;
  const from = value("out_of", base.out_of) || "external income";
  return {
    name: base.name,
    from,
    to: value("into", base.into) || "",
    mode: override && Object.prototype.hasOwnProperty.call(override, "sweep_above") ? "sweep"
      : override && Object.prototype.hasOwnProperty.call(override, "amount") ? "fixed"
      : base.sweep_above === undefined ? "fixed" : "sweep",
    amount,
    every: value("every", base.every),
    day: value("day", base.day),
    escalates: value("escalates", base.escalates),
    sweepAllowed: state.accounts.some((account) => account.name === from && account.kind === "clearing"),
  };
}

export function setOverrideAmount(override: UITransferOverride, value: string | number, mode: RowFields["mode"]): void {
  if (value === "") {
    delete override.amount;
    delete override.sweep_above;
    return;
  }
  const amount = parseFloat(String(value).replace(/,/g, "")) || 0;
  if (mode === "sweep") {
    override.sweep_above = amount;
    delete override.amount;
  } else {
    override.amount = amount;
    delete override.sweep_above;
  }
}

function setOverrideField(
  state: UIState,
  override: UITransferOverride,
  key: string,
  value: string | boolean,
  inheritedAmount: number | string,
  inheritedMode: RowFields["mode"],
  inheritedDay: string | number,
): void {
  if (key === "from") {
    value ? override.out_of = value === "external income" ? null : String(value) : delete override.out_of;
    if (override.sweep_above !== undefined && !state.accounts.some((account) => account.name === override.out_of && account.kind === "clearing")) {
      override.amount = override.sweep_above;
      delete override.sweep_above;
    }
  }
  else if (key === "to") value ? override.into = String(value) : delete override.into;
  else if (key === "mode") {
    const amount = override.sweep_above ?? override.amount ?? (parseFloat(String(inheritedAmount).replace(/,/g, "")) || 0);
    if (value === "sweep") {
      override.sweep_above = amount;
      delete override.amount;
    } else {
      override.amount = amount;
      delete override.sweep_above;
    }
  }
  else if (key === "amount") setOverrideAmount(override, String(value), inheritedMode);
  else if (key === "every") {
    if (value) {
      override.every = String(value);
      override.day = dayForEvery(override.every, inheritedDay);
    } else {
      delete override.every;
      delete override.day;
    }
  }
  else if (key === "day") value ? override.day = String(value) : delete override.day;
  else if (key === "escalates") override.escalates = value as boolean;
}

/** One row per transfer that exists, checked if it's part of this goal's
 * overrides -- exactly the columns from the Transfers section, pre-filled
 * from the base transfer until you change something. A checked row at
 * exactly $0 is tagged "stopped": once the amount is zero, from/to/every/on
 * are moot, so say so plainly instead of leaving it to be read off an
 * empty "to" box. */
export function overrideRowHTML(state: UIState, goal: UIGoal, goalIndex: number, transferName: string, checked: boolean): string {
  const base = resolveBase(state, goalIndex, transferName);
  const override = checked ? findOverride(goal, transferName) : undefined;
  const fields = toRowFields(state, base, override);
  const inherits = new Set<string>();
  if (override) {
    const keys = ["out_of", "into", "every", "day", "escalates"] as const;
    for (const key of keys) if (!Object.prototype.hasOwnProperty.call(override, key)) {
      inherits.add(key === "out_of" ? "from" : key === "into" ? "to" : key);
    }
    const hasAmount = Object.prototype.hasOwnProperty.call(override, "amount") || Object.prototype.hasOwnProperty.call(override, "sweep_above");
    if (!hasAmount) {
      inherits.add("amount");
      inherits.add("mode");
    }
  }
  const stopped = checked && override?.amount === 0;
  // A mark, not a word. It says one thing -- this transfer ends when the goal
  // fires -- which is already visible as a zero in the Amount column, so it
  // doesn't get to eat a column that's busy truncating people's names. Rides
  // inside the Name cell: as its own flex child beside the row it pushed
  // every stopped row out of line with the headings above it.
  const tag = stopped ? STOPPED_MARK : "";
  return (
    `<div class="override-row${checked ? " checked" : ""}${stopped ? " stopped" : ""}">` +
    `<button type="button" class="chk" data-toggle-transfer="${transferName}"></button>` +
    `<div class="transfer-row" data-transfer-name="${transferName}">` +
    transferFieldsHTML(fields, {
      disabled: !checked,
      nameEditable: introducedHere(state, goalIndex, transferName),
      tag,
      inGoal: true,
      inherits,
    }) +
    "</div></div>"
  );
}

/** The same column headings the Transfers section shows, indented past the
 * checkbox so they line up with the rows underneath. Without this you're
 * reading a grid of bare inputs and guessing which is which. */
function overrideHeadHTML(): string {
  return `<div class="override-head"><span class="chk-spacer"></span><div class="t-head">${transferHeadHTML()}</div></div>`;
}

/** A captioned block of override rows under their headings. Scrolls
 * sideways on its own, same as the Transfers section -- eight columns don't
 * fit a goal card on a narrow screen. */
function overrideListHTML(cap: string, rows: string): string {
  return (
    `<div class="me-when"><div class="cap">${cap}</div>` +
    `<div class="override-scroll"><div class="override-table">${overrideHeadHTML()}${rows}</div></div></div>`
  );
}

function accountOverrideRowHTML(state: UIState, goal: UIGoal, accountName: string, checked: boolean): string {
  let rate: number;
  if (checked) {
    rate = findAccountOverride(goal, accountName)!.rate;
  } else {
    const account = state.accounts.find((a) => a.name === accountName);
    rate = account ? account.rate : 0;
  }
  return (
    `<div class="override-row${checked ? " checked" : ""}">` +
    `<button type="button" class="chk" data-toggle-account="${accountName}"></button>` +
    `<div class="acct-rate-row"><span class="arn">${accountName}</span>` +
    `<input type="text" class="field-input" data-account-rate="${accountName}" value="${(rate * 100).toFixed(1)}%"${checked ? "" : " disabled"}></div>` +
    "</div>"
  );
}

function collapsedHTML(state: UIState, goal: UIGoal, goalIndex: number): string {
  let transferRows = "";
  for (const override of goal.transfers) transferRows += overrideRowHTML(state, goal, goalIndex, override.name, true);
  const onCompletion = goal.transfers.length
    ? overrideListHTML("On completion", transferRows)
    : `<div class="me-when"><div class="empty">no changes on completion</div></div>`;

  let acctRows = "";
  for (const override of goal.accounts) acctRows += accountOverrideRowHTML(state, goal, override.name, true);
  const acctSection = goal.accounts.length
    ? `<div class="me-when"><div class="cap">Also changes</div>${acctRows}</div>`
    : "";

  return (
    `<div class="g-head">` +
    `<div class="m-info"><div class="m-name">${goal.name}</div><div class="m-trigger">${triggerText(goal)}</div></div>` +
    `<button type="button" class="m-edit-btn" data-edit>Edit</button>` +
    removeButtonHTML(goal.name) +
    `</div>` +
    onCompletion + acctSection
  );
}

function triggerFieldsHTML(state: UIState, goal: UIGoal): string {
  if (goal.trigger === "date") {
    return `<input class="field-input short" type="date" data-trig-field="by" value="${goal.by}" min="${EARLIEST_PLAN_DATE}" max="${LATEST_PLAN_DATE}">`;
  }
  if (goal.trigger === "balance") {
    let options = "";
    for (const account of state.accounts) options += `<option${goal.account === account.name ? " selected" : ""}>${account.name}</option>`;
    return `<select class="field-input short" data-trig-field="account">${options}</select> reaches <input class="field-input short" data-trig-field="target" value="${goal.target}">`;
  }
  let options = "";
  for (const person of state.birthdays) options += `<option${goal.byAgePerson === person.name ? " selected" : ""}>${person.name}</option>`;
  return `<select class="field-input short" data-trig-field="byAgePerson">${options}</select> turns <input class="field-input short" data-trig-field="byAgeTurns" value="${goal.byAgeTurns}">`;
}

/** A name this goal is the first to mention: not in the base transfers list,
 * and no earlier goal introduced it. This goal owns it, so this is the one
 * place it can be renamed -- everywhere else the name is what picks out
 * which existing transfer the row is overriding. */
function introducedHere(state: UIState, goalIndex: number, name: string): boolean {
  if (findTransfer(state, name)) return false;
  for (let i = 0; i < goalIndex; i++) {
    if (findOverride(state.goals[i], name)) return false;
  }
  return true;
}

// every transfer that exists by the time this goal runs -- the base list,
// plus any name a goal before this one introduced. A goal can also show
// (and check) a name it introduces itself.
function availableTransferNames(state: UIState, goalIndex: number): string[] {
  const names: string[] = [];
  for (const transfer of state.transfers) names.push(transfer.name);
  for (let i = 0; i <= goalIndex; i++) {
    for (const override of state.goals[i].transfers) {
      if (!names.includes(override.name)) names.push(override.name);
    }
  }
  return names;
}

function editingHTML(state: UIState, goal: UIGoal, goalIndex: number): string {
  const types: Array<[TriggerType, string]> = [["date", "By date"], ["balance", "By balance"], ["age", "By age"]];
  let typeBtns = "";
  for (const [type, label] of types) {
    typeBtns += `<button type="button" class="tt-btn${goal.trigger === type ? " active" : ""}" data-trigtype="${type}">${label}</button>`;
  }

  let overrideRows = "";
  for (const name of availableTransferNames(state, goalIndex)) overrideRows += overrideRowHTML(state, goal, goalIndex, name, findOverride(goal, name) !== undefined);

  let acctRows = "";
  for (const account of state.accounts) acctRows += accountOverrideRowHTML(state, goal, account.name, findAccountOverride(goal, account.name) !== undefined);

  return (
    `<div class="me-top"><input class="field-input me-name" data-goal-name value="${goal.name}"><div class="trigger-type">${typeBtns}</div>` +
    removeButtonHTML(goal.name) +
    `</div>` +
    `<div class="trigger-fields">${triggerFieldsHTML(state, goal)}</div>` +
    overrideListHTML("On completion", overrideRows) +
    `<button class="add-ghost" type="button" data-add-transfer><span class="plus">+</span> Add a transfer</button>` +
    `<div class="me-when"><div class="cap">Also change an account's rate</div>${acctRows}</div>` +
    `<button type="button" class="save-link" data-save>Save — keep only what changed</button>`
  );
}

export function renderGoals(container: HTMLElement, state: UIState, onChange: () => void, expandTransferName?: string, focusGoalName?: string): void {
  const activeElement = document.activeElement as HTMLElement | null;
  const activeGoalIndex = activeElement?.closest<HTMLElement>(".goal-row")?.dataset.goalIndex;
  const activeTransferName = activeElement?.closest<HTMLElement>(".transfer-row")?.dataset.transferName;
  const activeField = activeElement?.dataset.field;
  const expandedRows = new Set(
    Array.from(container.querySelectorAll<HTMLElement>(".transfer-row.mobile-expanded"), (transferRow) =>
      `${transferRow.closest<HTMLElement>(".goal-row")?.dataset.goalIndex}:${transferRow.dataset.transferName}`,
    ),
  );
  container.innerHTML = "";

  for (let i = 0; i < state.goals.length; i++) {
    const goal = state.goals[i];
    const row = document.createElement("div");
    row.className = "goal-row";
    row.dataset.goalIndex = String(i);
    row.innerHTML = goal.editing ? editingHTML(state, goal, i) : collapsedHTML(state, goal, i);
    container.appendChild(row);
    wireGoalRow(container, row, state, goal, i, onChange);
    row.querySelectorAll<HTMLElement>(".transfer-row[data-transfer-name]").forEach((transferRow) => {
      const key = `${i}:${transferRow.dataset.transferName}`;
      if (!expandedRows.has(key) && expandTransferName !== transferRow.dataset.transferName) return;
      const toggle = transferRow.querySelector<HTMLButtonElement>("[data-mobile-toggle]")!;
      transferRow.classList.add("mobile-expanded");
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "Done";
    });
    if (activeGoalIndex === String(i) && activeTransferName && activeField) {
      row.querySelector<HTMLElement>(`.transfer-row[data-transfer-name="${activeTransferName}"] [data-field="${activeField}"]`)?.focus();
    }
    if (focusGoalName === goal.name) row.querySelector<HTMLInputElement>("[data-goal-name]")?.focus();
  }

  initCombos(container, state.accounts.map((a) => a.name));
}

function wireGoalRow(container: HTMLElement, row: HTMLElement, state: UIState, goal: UIGoal, goalIndex: number, onChange: () => void): void {
  const editBtn = row.querySelector<HTMLButtonElement>("[data-edit]");
  if (editBtn) editBtn.addEventListener("click", () => { goal.editing = true; renderGoals(container, state, onChange); });

  const saveBtn = row.querySelector<HTMLButtonElement>("[data-save]");
  if (saveBtn) saveBtn.addEventListener("click", () => { goal.editing = false; renderGoals(container, state, onChange); onChange(); });

  const nameInput = row.querySelector<HTMLInputElement>("[data-goal-name]");
  if (nameInput) nameInput.addEventListener("input", () => { goal.name = nameInput.value; onChange(); });

  const removeBtn = row.querySelector<HTMLButtonElement>("[data-remove]");
  if (removeBtn) removeBtn.addEventListener("click", () => {
    if (!confirmRemove(goal.name)) return;
    state.goals.splice(goalIndex, 1);
    renderGoals(container, state, onChange);
    onChange();
  });

  row.querySelectorAll<HTMLButtonElement>("[data-trigtype]").forEach((btn) => {
    btn.addEventListener("click", () => {
      goal.trigger = btn.dataset.trigtype as TriggerType;
      renderGoals(container, state, onChange);
    });
  });

  row.querySelectorAll<HTMLElement>("[data-trig-field]").forEach((field) => {
    const key = field.dataset.trigField!;
    const input = field as HTMLInputElement | HTMLSelectElement;
    if (key === "by") wireDateClamp(input as HTMLInputElement, EARLIEST_PLAN_DATE, LATEST_PLAN_DATE);
    input.addEventListener(key === "account" || key === "byAgePerson" ? "change" : "input", () => {
      if (key === "by") goal.by = input.value;
      else if (key === "account") goal.account = input.value;
      else if (key === "target") goal.target = parseFloat(input.value.replace(/,/g, "")) || 0;
      else if (key === "byAgePerson") goal.byAgePerson = input.value;
      else if (key === "byAgeTurns") goal.byAgeTurns = parseFloat(input.value) || 0;
      onChange();
    });
  });

  // checking a row snapshots the base transfer's current fields as the
  // override's starting point; unchecking drops it entirely
  row.querySelectorAll<HTMLButtonElement>("[data-toggle-transfer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.toggleTransfer!;
      const existing = findOverride(goal, name);
      if (existing) {
        goal.transfers = goal.transfers.filter((o) => o.name !== name);
      } else {
        goal.transfers.push({ name });
      }
      renderGoals(container, state, onChange);
      onChange();
    });
  });

  row.querySelectorAll<HTMLButtonElement>("[data-toggle-account]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.toggleAccount!;
      const existing = findAccountOverride(goal, name);
      if (existing) {
        goal.accounts = goal.accounts.filter((o) => o.name !== name);
      } else {
        const account = state.accounts.find((a) => a.name === name);
        goal.accounts.push({ name, rate: account ? account.rate : 0 });
      }
      renderGoals(container, state, onChange);
      onChange();
    });
  });

  row.querySelectorAll<HTMLInputElement>("[data-account-rate]").forEach((input) => {
    input.addEventListener("input", () => {
      const override = findAccountOverride(goal, input.dataset.accountRate!);
      if (override) {
        const parsed = parseFloat(input.value.replace("%", ""));
        override.rate = isNaN(parsed) ? 0 : parsed / 100;
        onChange();
      }
    });
  });

  // A goal can start a transfer that exists nowhere else -- a lease balloon
  // payment the day the lease ends, a drawdown that only begins at
  // retirement. Defaults to `once` with no date, which the engine reads as
  // "when this goal fires": for a balance- or age-triggered goal there's no
  // date you could sensibly type in advance anyway.
  const addTransferBtn = row.querySelector<HTMLButtonElement>("[data-add-transfer]");
  if (addTransferBtn) addTransferBtn.addEventListener("click", () => {
    const taken: Array<{ name: string }> = [];
    for (const name of availableTransferNames(state, goalIndex)) taken.push({ name });
    const name = nextName("new transfer", taken);
    goal.transfers.push({
      name,
      amount: 0, every: "once", day: "", out_of: null, into: null, escalates: true,
    });
    renderGoals(container, state, onChange, name);
    onChange();
  });

  row.querySelectorAll<HTMLElement>(".transfer-row[data-transfer-name]").forEach((transferRow) => {
    const name = transferRow.dataset.transferName!;
    const fields = toRowFields(state, resolveBase(state, goalIndex, name), findOverride(goal, name));

    // only editable on the goal that introduced it -- elsewhere the name is
    // the key picking out which transfer this row overrides
    const nameInput = transferRow.querySelector<HTMLInputElement>('[data-field="name"]')!;
    if (!nameInput.readOnly) {
      nameInput.addEventListener("change", () => {
        if (!renameTransfer(state, name, nameInput.value)) {
          nameInput.value = name;
          return;
        }
        renderGoals(container, state, onChange);
        onChange();
      });
    }

    wireTransferFieldRow(
      transferRow,
      (key, value) => {
        const override = findOverride(goal, name);
        if (override) setOverrideField(state, override, key, value, fields.amount, fields.mode, fields.day);
      },
      () => renderGoals(container, state, onChange),
      onChange,
    );
  });
}
