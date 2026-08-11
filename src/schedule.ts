/** When a transfer fires.
 *
 *     once       day is the date it happens -- 2030-03-14, and no other day
 *     week       day is a weekday name      -- sun
 *     fortnight  day is an anchor date      -- 2026-08-05, counts every 14 days
 *     month      day is a day of the month  -- 16, clamped to the month's last day
 *     year       day is month-day           -- 12-15, clamped the same way
 *
 * Nothing is nudged off a weekend -- the bank processes on the day, and moving
 * some payments to Friday and not others was a source of quiet disagreement
 * rather than accuracy (carried over from the Python engine's own design).
 */

import { addDays, daysBetween, daysInMonth, dayOfMonth, month as monthOf, weekday, year as yearOf, type ISODate } from "./dates";

const WEEKDAY_NAMES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function dates(every: string, day: string | number, start: ISODate, end: ISODate): ISODate[] {
  const result: ISODate[] = [];
  let when = start;
  while (when <= end) {
    if (fires(every, day, when)) result.push(when);
    when = addDays(when, 1);
  }
  return result;
}

export function fires(every: string, day: string | number, when: ISODate): boolean {
  // Nothing can be scheduled without a day, and a transfer can genuinely end
  // up without one -- a goal that stops a transfer an earlier goal was meant
  // to have started, applied before that goal fired, builds one out of
  // nothing but a name and an amount. It should quietly never fire, not take
  // the whole simulation (and the page it's running in) down.
  if (day === null || day === undefined || day === "") return false;
  if (every === "once") {
    return when === day;
  }
  if (every === "week") {
    return weekday(when) === WEEKDAY_NAMES.indexOf(String(day).toLowerCase());
  }
  if (every === "fortnight") {
    return ((daysBetween(day as ISODate, when) % 14) + 14) % 14 === 0;
  }
  if (every === "month") {
    return dayOfMonth(when) === clamp(Number(day), yearOf(when), monthOf(when));
  }
  if (every === "year") {
    const [mo, dayOfMo] = splitMonthDay(String(day));
    return monthOf(when) === mo && dayOfMonth(when) === clamp(dayOfMo, yearOf(when), mo);
  }
  throw new Error(`unknown frequency: ${every}`);
}

function clamp(requestedDay: number, y: number, m: number): number {
  const last = daysInMonth(y, m);
  return requestedDay > last ? last : requestedDay;
}

/** "12-25", or a whole date whose year is irrelevant -- a yearly transfer
 * matches on month and day, and the UI's On column is a date picker that can
 * only offer a whole date. Take the last two parts either way. */
function splitMonthDay(text: string): [number, number] {
  const parts = text.split("-").map(Number);
  return [parts[parts.length - 2], parts[parts.length - 1]];
}
