/** The From/To/Amount/Every/On/Inflation row -- built once, used verbatim by
 * both the Transfers section and every goal's "on completion" override list.
 * Same columns either place, so nothing new to learn moving from one to the
 * other.
 */

import { EARLIEST_PLAN_DATE, LATEST_PLAN_DATE } from "../dates";
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
  amount: number | string;
  every: string;
  day: string | number;
  escalates: boolean;
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

export function mobileTransferSummary(fields: RowFields): string {
  return `${formatAmount(fields.amount)} · ${fields.every}`;
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
const COLUMN_LABELS = ["Name", "From", "→", "To", "Amount", "Every", "On", "Infl."];

export function transferHeadHTML(): string {
  let html = "";
  for (const label of COLUMN_LABELS) html += `<span>${label}</span>`;
  return html;
}

function everySelectHTML(every: string, disabled: boolean): string {
  const options = ["once", "week", "fortnight", "month", "year"];
  let html = `<select class="field-input" data-field="every"${disabled ? " disabled" : ""}>`;
  for (const option of options) {
    html += `<option${option === every ? " selected" : ""}>${option}</option>`;
  }
  return html + "</select>";
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

/** week names a weekday -- every week has exactly one. Fortnight is the
 * same weekday, but a weekday alone doesn't say which of the two
 * alternating weeks -- it needs one real anchor date to count from, same
 * as the engine's own `day` field for a fortnightly transfer. Month is a
 * day of the month; year needs a real date too (the engine only reads the
 * month-day part of it). Once is the date it happens, and no other day. */
function onFieldHTML(every: string, day: string | number, disabled: boolean): string {
  const dis = disabled ? " disabled" : "";
  if (every === "week") {
    const selected = String(day).toLowerCase();
    let html = `<select class="field-input" data-field="day"${dis}>`;
    for (const [value, label] of WEEKDAYS) {
      html += `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
    }
    return html + "</select>";
  }
  if (every === "month") {
    let html = `<select class="field-input t-on" data-field="day"${dis}>`;
    for (const dayOfMonth of DAYS_OF_MONTH) {
      html += `<option${dayOfMonth === String(day) ? " selected" : ""}>${dayOfMonth}</option>`;
    }
    return html + "</select>";
  }
  return (
    `<input type="date" class="field-input t-on" data-field="day" value="${dayForInput(every, day)}"${dis} ` +
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
function inflationCheckboxHTML(escalates: boolean, disabled: boolean, inGoal: boolean): string {
  const label = inGoal
    ? "Grows with inflation — set here, this goal onwards"
    : "Grows with inflation";
  return (
    `<button type="button" class="chk infl-chk${escalates ? " checked" : ""}" data-field="escalates"` +
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
}

export function transferFieldsHTML(fields: RowFields, options: RowOptions = {}): string {
  const { disabled = false, nameEditable = false, tag = "", inGoal = false } = options;
  const dis = disabled ? " disabled" : "";
  const name = escapeHTML(fields.name);
  return (
    `<div class="mobile-row-summary">` +
    `<span class="mobile-row-name">${name}</span>` +
    `<span class="mobile-row-meta"><span data-mobile-amount="${escapeHTML(formatAmount(fields.amount))}">${escapeHTML(formatAmount(fields.amount))}</span> · <span data-mobile-every="${escapeHTML(fields.every)}">${escapeHTML(fields.every)}</span></span>` +
    `<button type="button" class="mobile-toggle" data-mobile-toggle aria-expanded="false" aria-label="Edit ${name}">Edit</button>` +
    `</div>` +
    `<div class="transfer-fields-grid">` +
    `<div class="mobile-field" data-label="Name"><div class="t-name-cell">` +
    `<input type="text" class="field-input t-name" data-field="name" value="${name}"${nameEditable ? "" : " readonly"}>` +
    tag +
    `</div></div>` +
    `<div class="mobile-field" data-label="From"><div class="combo" data-combo><input type="text" class="field-input combo-input" data-field="from" value="${escapeHTML(fields.from)}"${dis}></div></div>` +
    `<span class="arrow mobile-arrow">→</span>` +
    `<div class="mobile-field" data-label="To"><div class="combo" data-combo><input type="text" class="field-input combo-input" data-field="to" value="${escapeHTML(fields.to)}"${dis}></div></div>` +
    `<div class="mobile-field" data-label="Amount"><input class="field-input fig t-amount" data-field="amount" value="${escapeHTML(String(fields.amount))}"${dis}></div>` +
    `<div class="mobile-field" data-label="Every">${everySelectHTML(fields.every, disabled)}</div>` +
    `<div class="mobile-field" data-label="On">${onFieldHTML(fields.every, fields.day, disabled)}</div>` +
    `<div class="mobile-field" data-label="Inflation">${inflationCheckboxHTML(fields.escalates, disabled, inGoal)}</div>` +
    `</div>`
  );
}

function updateMobileSummary(row: HTMLElement): void {
  const amount = row.querySelector<HTMLInputElement>('[data-field="amount"]');
  const every = row.querySelector<HTMLSelectElement>('[data-field="every"]');
  const amountSummary = row.querySelector<HTMLElement>("[data-mobile-amount]");
  const everySummary = row.querySelector<HTMLElement>("[data-mobile-every]");
  if (!amount || !every || !amountSummary || !everySummary) return;
  amountSummary.textContent = formatAmount(amount.value);
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
        const newValue = !field.classList.contains("checked");
        field.classList.toggle("checked", newValue);
        setField("escalates", newValue);
        onAnyChange();
      });
      return;
    }
    const input = field as HTMLInputElement | HTMLSelectElement;
    if (key === "day" && input.getAttribute("type") === "date") {
      wireDateClamp(input as HTMLInputElement, EARLIEST_PLAN_DATE, LATEST_PLAN_DATE);
    }
    const eventName = key === "every" ? "change" : "input";
    input.addEventListener(eventName, () => {
      const every = row.querySelector<HTMLSelectElement>('[data-field="every"]')!.value;
      setField(key, key === "day" ? dayFromInput(every, input.value) : input.value);
      updateMobileSummary(row);
      onAnyChange();
      if (key === "every") onEveryChange();
    });
  });
}
