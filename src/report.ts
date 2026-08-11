/** The console tool's output, as plain text. Lives apart from cli.ts so it
 * can be bundled for anything that doesn't have a filesystem -- cli.ts reads
 * files, this only formats what a run produced.
 */

import { ageAt, type ISODate } from "./dates";
import type { Budget } from "./model";

export function formatReport(
  path: string,
  start: ISODate,
  budget: Budget,
  balances: Record<string, number>,
  completed: [string, ISODate][],
): string {
  const lines: string[] = [];
  lines.push(`${path}, from ${start}`);
  lines.push("");

  lines.push("milestones:");
  for (const [name, when] of completed) {
    const ages: string[] = [];
    for (const person of budget.birthdays) ages.push(String(ageAt(person.born, when)));
    lines.push(`  ${name.padEnd(30)} ${when}   ${ages.join("/")}`);
  }

  lines.push("");
  lines.push("balances at the end of the run:");
  for (const name of Object.keys(balances).sort()) {
    const value = balances[name].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    lines.push(`  ${name.padEnd(24)} ${value.padStart(14)}`);
  }

  return lines.join("\n");
}
