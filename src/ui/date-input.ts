import { clampToRange, type ISODate } from "../dates";

/** Every date input on the page is bounded twice over. `min`/`max` in the
 * markup stop the browser's calendar navigating outside the range -- that's
 * what kills paging through centuries. But you can still *type* into the
 * year segment, and "80" reads as the year 0080, so a typed date gets
 * snapped back on change too.
 *
 * The correction is announced as an `input` event rather than written into
 * state here, because every one of these fields already has its own `input`
 * listener that knows what the value means. One place decides a date is out
 * of range; the existing owner still decides what to do with it.
 */
export function wireDateClamp(input: HTMLInputElement, min: ISODate, max: ISODate): void {
  input.addEventListener("change", () => {
    const clamped = clampToRange(input.value, min, max);
    if (clamped === input.value) return;
    input.value = clamped;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
