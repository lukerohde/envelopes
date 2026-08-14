/** The "where the money goes" panel: the same annual in/out/net table the
 * console tool prints with --flows, on the page.
 *
 * This is the one diagnostic here that's for the person, not the agent.
 * Reconciling a pay account by hand -- weekly groceries plus fortnightly
 * cards plus monthly debits plus yearly insurances -- is how you find out
 * whether a plan is calibrated or guessed, and doing that arithmetic on
 * paper is miserable.
 */

import { cadenceFactor, phaseWindow, type FlowCadence, type PhaseSummary } from "../flows";

function money(value: number): string {
  return Math.round(value).toLocaleString();
}

function cover(years: number): string {
  if (Number.isNaN(years)) return "";
  if (years === Infinity) return "—";
  if (years === 0) return "-";
  return `${years.toFixed(1)}y`;
}

function cell(value: number): string {
  return `<td class="fig${value < 0 ? " flow-neg" : ""}">${money(value)}</td>`;
}

function cadenceSuffix(cadence: FlowCadence): string {
  if (cadence === "week") return "wk";
  if (cadence === "fortnight") return "fortnight";
  if (cadence === "month") return "mo";
  return "yr";
}

export function renderFlows(
  container: HTMLElement,
  summaries: PhaseSummary[],
  real: boolean,
  cadence: FlowCadence = "year",
): void {
  container.innerHTML = "";
  const scale = cadenceFactor(cadence);
  const suffix = cadenceSuffix(cadence);

  for (const phase of summaries) {
    const block = document.createElement("div");
    block.className = "flow-phase";

    const rows = phase.rows
      .map(
        (row) =>
          `<tr><td>${row.account}</td>${cell(row.inPerYear * scale)}${cell(row.outPerYear * scale)}` +
          `${cell(row.interestPerYear * scale)}${cell(row.netPerYear * scale)}${cell(row.closing)}` +
          `<td>${cover(row.cover)}</td></tr>`,
      )
      .join("");

    block.innerHTML =
      `<h4>${phase.name}</h4>` +
      `<div class="flow-when">${phase.start} to ${phase.end} · ${phaseWindow(phase.years)}` +
      `${real ? " · today's dollars" : ""}</div>` +
      `<div class="flow-scroll"><table class="flow-table">` +
      `<thead><tr><th>Account</th><th>In /${suffix}</th><th>Out /${suffix}</th><th>Interest /${suffix}</th>` +
      `<th>Net /${suffix}</th><th>Closing</th><th>Lasts</th></tr></thead>` +
      `<tbody>${rows}` +
      `<tr class="flow-surplus"><td>Unallocated surplus</td>${cell(phase.surplusPerYear * scale)}` +
      `<td colspan="5"></td></tr>` +
      `</tbody></table></div>`;

    container.appendChild(block);
  }
}
