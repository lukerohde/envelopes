/** Dates as plain "YYYY-MM-DD" strings throughout -- they sort and compare
 * correctly as strings, and staying off JS's local-timezone Date arithmetic
 * avoids DST off-by-one bugs entirely. */

export type ISODate = string;

function toEpochDay(d: ISODate): number {
  const [year, month, day] = d.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function fromEpochDay(epochDay: number): ISODate {
  const d = new Date(epochDay * 86_400_000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromEpochDay(toEpochDay(d) + n);
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function year(d: ISODate): number {
  return Number(d.slice(0, 4));
}

export function month(d: ISODate): number {
  return Number(d.slice(5, 7));
}

export function dayOfMonth(d: ISODate): number {
  return Number(d.slice(8, 10));
}

const WEEKDAYS: ISODate = "2024-12-30"; // a known Monday, epoch-day-aligned anchor

export function weekday(d: ISODate): number {
  // 0 = Monday .. 6 = Sunday, matching Python's date.weekday()
  return ((daysBetween(WEEKDAYS, d) % 7) + 7) % 7;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function todayISO(): ISODate {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The bounds every date input on the page is held to. Birthdays reach back
 * a century and stop at today; anything to do with the plan itself sits in a
 * window either side of now -- wide enough for a real fortnightly anchor
 * date set years ago, narrow enough that the calendar can't wander. */
export const EARLIEST_BIRTHDAY: ISODate = "1900-01-01";
export const EARLIEST_PLAN_DATE: ISODate = "2000-01-01";
export const LATEST_PLAN_DATE: ISODate = "2100-12-31";

/** Holds a typed date inside its input's own min/max. `min`/`max` alone stop
 * the calendar navigating out of range, but you can still *type* a year --
 * "80" reads as the year 0080, which is where the century-paging came from.
 * Plain string comparison is enough: these are zero-padded ISO dates, which
 * sort in date order. An empty value stays empty, since "no date yet" is a
 * real state for a goal. */
export function clampToRange(value: ISODate, min: ISODate, max: ISODate): ISODate {
  if (!value) return "";
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** The console tool's own horizon, and the fallback here when nobody has a
 * birthday recorded to work one out from. */
const DEFAULT_HORIZON_YEARS = 40;

/** How far out the simulation can be dragged: far enough for the youngest
 * person in the budget to turn 100, rounded *up* to a whole five years. Up,
 * not to-nearest, because rounding 57 down to 55 would stop the run three
 * years before the thing it's meant to reach. Five-year steps keep the
 * timeline's tick labels round. */
export function horizonYears(birthdays: Array<{ born: ISODate }>, when: ISODate): number {
  let youngest = -1;
  for (const person of birthdays) {
    const age = ageAt(person.born, when);
    if (youngest === -1 || age < youngest) youngest = age;
  }
  if (youngest === -1) return DEFAULT_HORIZON_YEARS;
  return Math.max(5, Math.ceil((100 - youngest) / 5) * 5);
}

/** How old someone born on `born` is on `when` -- counts the birthday
 * itself as the new age, same as everyone means when they say their age. */
export function ageAt(born: ISODate, when: ISODate): number {
  let years = year(when) - year(born);
  if (month(when) < month(born) || (month(when) === month(born) && dayOfMonth(when) < dayOfMonth(born))) {
    years -= 1;
  }
  return years;
}
