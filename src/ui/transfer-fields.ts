/** The From/To/Amount/Every/On/Inflation row -- built once, used verbatim by
 * both the Transfers section and every goal's "on completion" override list.
 * Same columns either place, so nothing new to learn moving from one to the
 * other.
 */

import { EARLIEST_PLAN_DATE, LATEST_PLAN_DATE, todayISO } from "../dates";
import { wireDateClamp } from "./date-input";

/** Lowercase value, capitalised label. The engine matches weekday names in
 * lowercase, so an option valued "Sat" wrote a day no transfer ever fired
 * on -- and a config loaded with `day: sat` matched no option at all, so the
 * select silently showed Monday instead of the day actually configured. */
export const WEEKDAYS: Array<[string, string]> = [
  ["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"],
  ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"],
];
const DAYS_OF_MONTH: string[] = [];
for (let d = 1; d <= 31; d++) DAYS_OF_MONTH.push(String(d));

export interface RowFields {
  name: string;
  from: string;
  to: string;
  mode: "fixed" | "sweep";
  amount: number | string;
  every: string;
  day: string | number;
  escalates: boolean;
  sweepAllowed?: boolean;
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

export function mobileTransferSummary(fields: RowFields): string {
  const amount = fields.mode === "sweep" ? `above ${formatAmount(fields.amount)}` : formatAmount(fields.amount);
  return `${amount} · ${fields.every}`;
}

function formatAmount(value: number | string): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** The column headings, in grid order -- written once here and rendered
 * above both the Transfers list and every goal's override list, so the two
 * can't drift into disagreeing about what they're showing. */
// "Infl." rather than "Inflation" -- the column under it is one checkbox
// wide, and the full word overflows the card it sits in. The button itself
// carries the long form as its title and aria-label.
const COLUMN_LABELS = ["Name", "From", "→", "To", "Type", "Amount / keep", "Every", "On", "Infl."];

export function transferHeadHTML(): string {
  let html = "";
  for (const label of COLUMN_LABELS) html += `<span>${label}</span>`;
  return html;
}

function everySelectHTML(every: string, disabled: boolean, inherited: boolean): string {
  const options = ["once", "week", "fortnight", "month", "year"];
  let html = `<select class="field-input" data-field="every"${disabled ? " disabled" : ""}>`;
  if (inherited) html += `<option value="" selected>inherits ${every}</option>`;
  for (const option of options) {
    html += `<option${!inherited && option === every ? " selected" : ""}>${option}</option>`;
  }
  return html + "</select>";
}

function modeSelectHTML(mode: RowFields["mode"], disabled: boolean, inherited: boolean, sweepAllowed: boolean): string {
  const dis = disabled ? " disabled" : "";
  const inheritedOption = inherited ? `<option value="" selected>inherits ${mode === "sweep" ? "sweep" : "fixed"}</option>` : "";
  const sweepOption = `<option value="sweep"${!inherited && mode === "sweep" ? " selected" : ""}${!sweepAllowed ? " disabled" : ""}>${sweepAllowed ? "Sweep" : "Sweep (clearing only)"}</option>`;
  return (
    `<select class="field-input amount-mode" data-field="mode"${dis} aria-label="Transfer mode" ` +
    `title="Fixed transfers the amount. Sweep keeps the configured balance in From and transfers only the excess when its schedule runs.">` +
    `${inheritedOption}<option value="fixed"${!inherited && mode === "fixed" ? " selected" : ""}>Fixed</option>` +
    sweepOption +
    `</select>`
  );
}

/** A yearly transfer's `day` is "MM-DD" -- the engine matches on month and
 * day and never looks at a year. The On column is a date picker, which only
 * deals in whole dates, so translate at the edge in both directions. The
 * placeholder year is arbitrary and never survives the trip back.
 *
 * Every other date-shaped frequency (once, fortnight, year's neighbours)
 * stores a real date already and passes straight through. */
const PLACEHOLDER_YEAR = "2000";

export function dayForInput(every: string, day: string | number): string {
  const text = String(day);
  if (every === "year") return text.length === 5 ? `${PLACEHOLDER_YEAR}-${text}` : "";
  return text.length === 10 ? text : "";
}

export function dayFromInput(every: string, value: string): string {
  if (every === "year") return value.slice(5);
  return value;
}

/** Changing Every also changes what On means. A select whose state contains
 * an incompatible old value still displays its first option, which is much
 * worse than a blank: it looks configured while the schedule never fires.
 * Keep compatible values and otherwise store the same sensible default the
 * newly rendered control will show. */
export function dayForEvery(every: string, day: string | number, today = todayISO()): string | number {
  const value = String(day).toLowerCase();
  if (every === "week") return WEEKDAYS.some(([name]) => name === value) ? value : "mon";
  if (every === "month") {
    const numbered = Number(value);
    return Number.isInteger(numbered) && numbered >= 1 && numbered <= 31 ? numbered : 1;
  }
  if (every === "year") {
    const monthDay = value.match(/^(\d{2})-(\d{2})$/);
    if (monthDay && Number(monthDay[1]) >= 1 && Number(monthDay[1]) <= 12 && Number(monthDay[2]) >= 1 && Number(monthDay[2]) <= 31) {
      return value;
    }
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(5) : today.slice(5);
  }
  if (every === "once" || every === "fortnight") {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : today;
  }
  return day;
}

/** week names a weekday -- every week has exactly one. Fortnight is the
 * same weekday, but a weekday alone doesn't say which of the two
 * alternating weeks -- it needs one real anchor date to count from, same
 * as the engine's own `day` field for a fortnightly transfer. Month is a
 * day of the month; year needs a real date too (the engine only reads the
 * month-day part of it). Once is the date it happens, and no other day. */
function onFieldHTML(every: string, day: string | number, disabled: boolean, inherited: boolean): string {
  const dis = disabled ? " disabled" : "";
  const inheritedOption = inherited ? `<option value="" selected>inherits ${day}</option>` : "";
  if (every === "week") {
    const selected = String(day).toLowerCase();
    let html = `<select class="field-input" data-field="day"${dis}>`;
    html += inheritedOption;
    if (!inherited && !WEEKDAYS.some(([value]) => value === selected)) {
      html += '<option value="" selected>pick a day</option>';
    }
    for (const [value, label] of WEEKDAYS) {
      html += `<option value="${value}"${!inherited && value === selected ? " selected" : ""}>${label}</option>`;
    }
    return html + "</select>";
  }
  if (every === "month") {
    const selected = Number(day);
    const valid = Number.isInteger(selected) && selected >= 1 && selected <= 31;
    let html = `<select class="field-input t-on" data-field="day"${dis}>`;
    html += inheritedOption;
    if (!inherited && !valid) html += '<option value="" selected>pick a day</option>';
    for (const dayOfMonth of DAYS_OF_MONTH) {
      html += `<option${!inherited && valid && dayOfMonth === String(selected) ? " selected" : ""}>${dayOfMonth}</option>`;
    }
    return html + "</select>";
  }
  return (
    `<input type="date" class="field-input t-on" data-field="day" value="${inherited ? "" : dayForInput(every, day)}"${inherited ? ` placeholder="inherits ${day}"` : ""}${dis} ` +
    `min="${EARLIEST_PLAN_DATE}" max="${LATEST_PLAN_DATE}">`
  );
}

/** A plain yes/no in place of a raw escalation percentage: checked grows
 * with inflation (the default for almost everything), unchecked is a
 * fixed nominal amount -- a mortgage repayment, say, which doesn't get a
 * "pay rise" the way a salary does.
 *
 * Inside a goal it overrides per goal, exactly like every other column in
 * the row -- a repayment that was fixed while you were working can become
 * inflation-linked once a goal turns it into something else. That wasn't
 * obvious from a bare checkbox, hence the label spelling it out. */
function inflationCheckboxHTML(escalates: boolean, disabled: boolean, inGoal: boolean, inherited: boolean, mode: RowFields["mode"]): string {
  const label = mode === "sweep"
    ? inherited
      ? "Inherits whether the retained balance grows with inflation from the simulation start"
      : inGoal
        ? "Retained balance grows with inflation from the simulation start — set here, this goal onwards"
        : "Retained balance grows with inflation from the simulation start"
    : inherited ? "Inherits inflation from the transfer" : inGoal
      ? "Grows with inflation — set here, this goal onwards"
      : "Grows with inflation";
  return (
    `<button type="button" class="chk infl-chk${escalates ? " checked" : ""}${inherited ? " inherited" : ""}" data-field="escalates" data-inherited-value="${escalates}"` +
    `${disabled ? " disabled" : ""} title="${label}" aria-label="${label}"></button>`
  );
}

export interface RowOptions {
  /** Greyed out -- an override row nobody has ticked yet. */
  disabled?: boolean;
  /** Only the Transfers section, and the goal that introduced the name.
   * Everywhere else the name is what picks out *which* transfer the row is
   * overriding, so it's shown to make the row identifiable but not editable
   * -- readonly rather than disabled, so it stays legible on a row whose
   * other fields are greyed out. */
  nameEditable?: boolean;
  /** Markup to sit beside the name, e.g. the stopped mark. */
  tag?: string;
  /** Inside a goal's override list, where every field is per-goal. */
  inGoal?: boolean;
  /** Fields omitted by this override, shown as muted inherited values. */
  inherits?: Set<string>;
}

export function transferFieldsHTML(fields: RowFields, options: RowOptions = {}): string {
  const { disabled = false, nameEditable = false, tag = "", inGoal = false, inherits = new Set<string>() } = options;
  const dis = disabled ? " disabled" : "";
  const name = escapeHTML(fields.name);
  const inheritedInput = (key: string, value: string | number): string => inherits.has(key)
    ? `value="" placeholder="inherits ${escapeHTML(String(value))}"`
    : `value="${escapeHTML(String(value))}"`;
  const amountLabel = fields.mode === "sweep" ? "Keep balance" : "Amount";
  const amountHelp = fields.mode === "sweep"
    ? "A sweep runs only on its schedule, keeps this balance in From, and transfers the excess. With inflation on, the retained balance grows from the simulation start."
    : "Amount transferred whenever the schedule runs.";
  const amountAria = fields.mode === "sweep" ? "Balance to keep when the sweep runs" : "Transfer amount";
  return (
    `<div class="mobile-row-summary">` +
    `<span class="mobile-row-name">${name}</span>` +
    `<span class="mobile-row-meta"><span data-mobile-amount="${escapeHTML(formatAmount(fields.amount))}">${escapeHTML(fields.mode === "sweep" ? `above ${formatAmount(fields.amount)}` : formatAmount(fields.amount))}</span> · <span data-mobile-every="${escapeHTML(fields.every)}">${escapeHTML(fields.every)}</span></span>` +
    `<button type="button" class="mobile-toggle" data-mobile-toggle aria-expanded="false" aria-label="Edit ${name}">Edit</button>` +
    `</div>` +
    `<div class="transfer-fields-grid">` +
    `<div class="mobile-field" data-label="Name"><div class="t-name-cell">` +
    `<input type="text" class="field-input t-name" data-field="name" value="${name}"${nameEditable ? "" : " readonly"}>` +
    tag +
    `</div></div>` +
    `<div class="mobile-field" data-label="From"><div class="combo" data-combo><input type="text" class="field-input combo-input" data-field="from" ${inheritedInput("from", fields.from)}${dis}></div></div>` +
    `<span class="arrow mobile-arrow">→</span>` +
    `<div class="mobile-field" data-label="To"><div class="combo" data-combo><input type="text" class="field-input combo-input" data-field="to" ${inheritedInput("to", fields.to)}${dis}></div></div>` +
    `<div class="mobile-field" data-label="Type">${modeSelectHTML(fields.mode, disabled, inherits.has("mode"), fields.sweepAllowed !== false)}</div>` +
    `<div class="mobile-field" data-label="${amountLabel}"><input class="field-input fig t-amount" data-field="amount" ${inheritedInput("amount", formatAmount(fields.amount))}${dis} ` +
    `aria-label="${amountAria}" title="${amountHelp}"></div>` +
    `<div class="mobile-field" data-label="Every">${everySelectHTML(fields.every, disabled, inherits.has("every"))}</div>` +
    `<div class="mobile-field" data-label="On">${onFieldHTML(fields.every, fields.day, disabled, inherits.has("day"))}</div>` +
    `<div class="mobile-field" data-label="Inflation">${inflationCheckboxHTML(fields.escalates, disabled, inGoal, inherits.has("escalates"), fields.mode)}</div>` +
    `</div>`
  );
}

function updateMobileSummary(row: HTMLElement): void {
  const amount = row.querySelector<HTMLInputElement>('[data-field="amount"]');
  const mode = row.querySelector<HTMLSelectElement>('[data-field="mode"]');
  const every = row.querySelector<HTMLSelectElement>('[data-field="every"]');
  const amountSummary = row.querySelector<HTMLElement>("[data-mobile-amount]");
  const everySummary = row.querySelector<HTMLElement>("[data-mobile-every]");
  if (!amount || !mode || !every || !amountSummary || !everySummary) return;
  amountSummary.textContent = mode.value === "sweep" ? `above ${formatAmount(amount.value)}` : formatAmount(amount.value);
  amountSummary.dataset.mobileAmount = formatAmount(amount.value);
  everySummary.textContent = every.value;
  everySummary.dataset.mobileEvery = every.value;
}

/** Wires every field in a rendered row to a plain setField(key, value)
 * callback -- the caller decides what each key actually means for its own
 * data (a transfer's out_of/into, or an override's), no field-renaming
 * trickery here. Changing "every" needs a full re-render since "on"
 * changes shape, so that's a separate callback too. */
export function wireTransferFieldRow(
  row: HTMLElement,
  setField: (key: string, value: string | boolean) => void,
  onEveryChange: () => void,
  onAnyChange: () => void,
): void {
  const toggle = row.querySelector<HTMLButtonElement>("[data-mobile-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      const expanded = row.classList.toggle("mobile-expanded");
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.textContent = expanded ? "Done" : "Edit";
    });
  }
  row.querySelectorAll<HTMLElement>("[data-field]").forEach((field) => {
    const key = field.dataset.field!;
    // the name isn't an ordinary field -- renaming has to cascade into every
    // goal override that references it, so the Transfers section wires it
    // itself and it's readonly everywhere else
    if (key === "name") return;
    if (key === "escalates") {
      field.addEventListener("click", () => {
        const newValue = field.classList.contains("inherited")
          ? field.dataset.inheritedValue !== "true"
          : !field.classList.contains("checked");
        field.classList.toggle("checked", newValue);
        field.classList.remove("inherited");
        setField("escalates", newValue);
        onAnyChange();
      });
      return;
    }
    const input = field as HTMLInputElement | HTMLSelectElement;
    if (key === "day" && input.getAttribute("type") === "date") {
      wireDateClamp(input as HTMLInputElement, EARLIEST_PLAN_DATE, LATEST_PLAN_DATE);
    }
    const eventName = key === "every" || key === "mode" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const every = row.querySelector<HTMLSelectElement>('[data-field="every"]')!.value;
      setField(key, key === "day" ? dayFromInput(every, input.value) : input.value);
      updateMobileSummary(row);
      onAnyChange();
      // Mode changes what the adjacent number and inflation toggle mean, so
      // redraw it as well as the schedule-dependent On control.
      if (key === "every" || key === "mode") onEveryChange();
    });
    // A source account determines whether Sweep above is legal. The combo
    // emits change only when an option is chosen (not on every search
    // keystroke), so a newly selected clearing account enables the mode
    // immediately without interrupting account-name entry.
    if (key === "from") input.addEventListener("change", onEveryChange);
  });
}
