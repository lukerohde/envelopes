/** Ordering for the Milestones list: whichever goal was actually reached
 * first, first -- not just the order goals happen to be listed in the
 * config. A goal never reached within the tracked horizon has no real date
 * to sort by, so it sorts as if it were infinitely far away, keeping it
 * after every goal that did complete, and leaving ties in their original
 * relative order (a plain stable sort already does that). */
export interface MilestoneEntry {
  year: number; // Infinity if never reached
}

export function sortMilestones<T extends MilestoneEntry>(entries: T[]): T[] {
  return [...entries].sort((a, b) => a.year - b.year);
}
