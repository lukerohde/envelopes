/** Waits until the calls stop coming before actually running `fn` -- used to
 * keep a full simulation recompute (a real, if small, chunk of work) from
 * running on every single keystroke while someone's still typing a number. */
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, ms: number): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
