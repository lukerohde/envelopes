/** The chart, the scrub-and-horizon timeline, the "accounts at this moment"
 * balances strip, and the read-only Milestones list -- all one section
 * because they all move together off the same scrub position. Runs the
 * real engine (toBudget + run()) every time anything changes; nothing here
 * re-implements what the simulator already does.
 */

import { addDays, daysBetween, horizonYears, todayISO, type ISODate } from "../dates";
import { run, type History, type Phase } from "../simulate";
import { groupAccounts, toBudget, type UIState, type UIGoal, type UIPerson } from "../state";
import { sortMilestones } from "../milestones";
import { breaches, summarise, type FlowCadence } from "../flows";
import { renderFlows } from "./flows";
import type { Budget } from "../model";
import { compareOutcomes, formatImpact, type PlanOutcome } from "../compare";
import { checkPlan } from "../check";

// How far the timeline can be dragged. Not a constant any more: it runs
// until the youngest person in the budget turns 100, so a 30-year-old sees
// the whole of their retirement rather than stopping at 70. Recomputed on
// every run, since editing a birthday changes it.
let absMax = horizonYears([], todayISO());
const W = 720;
const H = 260;
const MARGIN = { top: 14, right: 16, bottom: 22, left: 66 };
const PLOT_W = W - MARGIN.left - MARGIN.right;
const PLOT_H = H - MARGIN.top - MARGIN.bottom;

interface Elements {
  acctSelect: HTMLSelectElement;
  inflationInput: HTMLInputElement;
  autoBadge: HTMLElement;
  simHeading: HTMLElement;
  chartSvg: SVGSVGElement;
  track: HTMLElement;
  reachedFill: HTMLElement;
  neverFill: HTMLElement;
  scrubHandle: HTMLElement;
  horizonHandle: HTMLElement;
  balHeading: HTMLElement;
  balRows: HTMLElement;
  flowRows: HTMLElement;
  scrubReadout: HTMLElement;
  milestoneRows: HTMLElement;
  timelineTicks: HTMLElement;
  terminalStatus: HTMLElement;
  impactStatus: HTMLElement;
  planStatus: HTMLElement;
  dollarButtons: NodeListOf<HTMLButtonElement>;
  cadenceButtons: NodeListOf<HTMLButtonElement>;
}

function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

function niceStep(rough: number): number {
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const residual = rough / magnitude;
  let step: number;
  if (residual > 5) step = 10;
  else if (residual > 2) step = 5;
  else if (residual > 1) step = 2;
  else step = 1;
  return step * magnitude;
}

/** A [year, value] point at every whole-day sample from a run()'s history. */
function yearPoints(days: [ISODate, number][], start: ISODate): [number, number][] {
  const points: [number, number][] = [];
  for (const [when, value] of days) points.push([daysBetween(start, when) / 365.25, value]);
  return points;
}

function interpAt(points: [number, number][], year: number): number {
  if (points.length === 0) return 0;
  if (year <= points[0][0]) return points[0][1];
  const last = points[points.length - 1];
  if (year >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (year >= a[0] && year <= b[0]) {
      const t = (year - a[0]) / (b[0] - a[0] || 1);
      return a[1] + (b[1] - a[1]) * t;
    }
  }
  return last[1];
}

/** The slider opens at the first terminal event: the final milestone or a
 * floor breach, whichever comes first. */
export function defaultScrubYear(completed: [string, ISODate][], start: ISODate, breachYear: number): number {
  let latest = 0;
  for (const [, when] of completed) latest = Math.max(latest, daysBetween(start, when) / 365.25);
  if (latest === 0) return breachYear === Infinity ? 0 : breachYear;
  return Math.min(latest, breachYear);
}

/** A goal reached after a floor breach is beyond the point where the plan
 * describes a real life. Keep it in the raw run for diagnostics, but don't
 * present it as a reached milestone in the page. */
export function completedThrough(completed: [string, ISODate][], stopOn: ISODate | null): [string, ISODate][] {
  return stopOn ? completed.filter(([, when]) => when <= stopOn) : completed;
}

/** Pick the account that explains why this run stops. A failed plan takes
 * precedence over its later intended ending; a person's own choice takes
 * precedence over both. */
export function autoSelectedAccount(
  pickedByHand: boolean,
  accountNames: string[],
  breachAccount: string | null,
  terminalAccount: string | null,
): string | null {
  if (pickedByHand) return null;
  for (const candidate of [breachAccount, terminalAccount]) {
    if (candidate && accountNames.includes(candidate)) return candidate;
  }
  return null;
}

function ageAtISO(born: ISODate, when: ISODate): number {
  const b = new Date(born), w = new Date(when);
  let years = w.getUTCFullYear() - b.getUTCFullYear();
  if (w.getUTCMonth() < b.getUTCMonth() || (w.getUTCMonth() === b.getUTCMonth() && w.getUTCDate() < b.getUTCDate())) years -= 1;
  return years;
}

export function simulationHorizonLabel(people: UIPerson[], start: ISODate, years: number): string {
  if (people.length === 0) return `Simulating ${Math.round(years)} years`;
  const end = addDays(start, Math.round(years * 365.25));
  const endLabel = new Date(end).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const ages: string[] = [];
  for (const person of people) ages.push(`${person.name} ${ageAtISO(person.born, end)}`);
  return `Simulating to ${endLabel}<span class="sim-ages">${ages.join(" · ")}</span>`;
}

export function createSimulationView(elements: Elements) {
  const view = {
    requestedMax: absMax,
    scrubYear: 0,
    dollars: "future" as "future" | "today",
    cadence: "year" as FlowCadence,
  };
  let start = todayISO();
  let series: Record<string, { floor: number; points: [number, number][] }> = {};
  let breachYear = Infinity;
  let breachAccount: string | null = null;
  let terminalYear = Infinity;
  let terminalAccount: string | null = null;
  // Until you choose an account yourself, the chart shows why the run ended:
  // a floor failure, otherwise the explicit terminal goal. Once you've picked
  // one, it stays picked; having the selection yanked away on every recompute
  // while you're editing would be maddening.
  let pickedByHand = false;

  function inflationRate(): number {
    const parsed = parseFloat(elements.inflationInput.value);
    return isNaN(parsed) ? 0 : parsed / 100;
  }

  // real value at year `yr`, deflated back to today's purchasing power when
  // view.dollars === "today". The simulation is always nominal -- this is
  // a pure display transform, computed here, never tracked as a second
  // number inside the simulation itself.
  function deflate(value: number, year: number): number {
    if (view.dollars !== "today") return value;
    return value / Math.pow(1 + inflationRate(), year);
  }

  function effectiveMax(): number {
    return Math.min(view.requestedMax, breachYear, terminalYear);
  }

  // Kept from the last run so the Future$/Today's$ toggle can redraw the
  // flows without re-simulating -- it's a display transform, same as the
  // balances panel above.
  let lastPhases: Phase[] = [];
  let lastBudget: Budget | null = null;
  let lastOutcome: PlanOutcome | null = null;

  function renderFlowPanel(): void {
    if (!lastBudget) return;
    renderFlows(
      elements.flowRows,
      summarise(lastPhases, lastBudget, start, view.dollars === "today"),
      view.dollars === "today",
      view.cadence,
    );
  }

  function refresh(state: UIState, completed: [string, ISODate][]): void {
    if (view.scrubYear > effectiveMax()) view.scrubYear = effectiveMax();
    completedGoals = completed;
    drawChart(state);
    layoutTimeline();
    renderScrubReadout(state);
    renderBalances(state);
    renderMilestones(state);
    renderFlowPanel();
  }

  let completedGoals: [string, ISODate][] = [];

  function drawChart(state: UIState): void {
    const account = elements.acctSelect.value;
    const data = series[account];
    if (!data) return;
    const max = effectiveMax();
    const stoppedAtBreach = max === breachYear && breachYear !== Infinity;
    const stoppedAtExit = max === terminalYear && terminalYear !== Infinity;
    // only claim "auto-selected" when it actually was -- picking the
    // breaching account yourself shouldn't be described back to you as
    // something the page did
    const autoFloor = !pickedByHand && account === breachAccount && stoppedAtBreach;
    const autoTerminal = !pickedByHand && account === terminalAccount && stoppedAtExit;
    const autoShown = autoFloor || autoTerminal;
    elements.autoBadge.style.display = autoShown ? "" : "none";
    elements.autoBadge.classList.toggle("terminal", autoTerminal);
    elements.autoBadge.textContent = autoTerminal
      ? "✓ auto-selected — ends simulation"
      : "⚠ auto-selected — hit its floor";

    const knots = data.points.filter((p) => p[0] <= max);
    if (knots.length === 0 || knots[knots.length - 1][0] < max) knots.push([max, interpAt(data.points, max)]);

    const values = knots.map((p) => p[1]).concat([data.floor]);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const pad = (dataMax - dataMin) * 0.12 || 1;
    const yMin = dataMin - pad;
    const yMax = dataMax + pad;

    const x = (yr: number) => MARGIN.left + (yr / view.requestedMax) * PLOT_W;
    const y = (v: number) => MARGIN.top + PLOT_H - ((v - yMin) / (yMax - yMin || 1)) * PLOT_H;

    const parts: string[] = [];
    const step = niceStep((yMax - yMin) / 4);
    for (let g = Math.ceil(yMin / step) * step; g <= yMax; g += step) {
      const gy = y(g);
      parts.push(`<line class="gridline" x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${gy}" y2="${gy}"/>`);
      parts.push(`<text class="axis-label" x="${MARGIN.left - 8}" y="${gy + 3}" text-anchor="end">${Math.round(g).toLocaleString()}</text>`);
    }
    [0, view.requestedMax / 2, view.requestedMax].forEach((yr, i) => {
      const anchor = i === 0 ? "start" : i === 2 ? "end" : "middle";
      parts.push(`<text class="axis-label" x="${x(yr)}" y="${H - MARGIN.bottom + 15}" text-anchor="${anchor}">${yearToLabel(yr)}</text>`);
    });
    const fy = y(data.floor);
    parts.push(`<line class="floor-line" x1="${MARGIN.left}" x2="${W - MARGIN.right}" y1="${fy}" y2="${fy}"/>`);
    if (view.requestedMax > max) {
      const zx0 = x(max), zx1 = x(view.requestedMax);
      parts.push(`<rect class="never-zone" x="${zx0}" y="${MARGIN.top}" width="${zx1 - zx0}" height="${PLOT_H}"/>`);
      const label = stoppedAtExit ? "simulation ends" : "never reached";
      parts.push(`<text class="never-label" x="${(zx0 + zx1) / 2}" y="${MARGIN.top + PLOT_H / 2}" text-anchor="middle">${label}</text>`);
    }
    const linePts = knots.map((p) => `${x(p[0])},${y(p[1])}`).join(" ");
    parts.push(`<polyline class="bal-line" points="${linePts}"/>`);
    const lastKnot = knots[knots.length - 1];
    if (stoppedAtBreach) {
      parts.push(`<circle class="breach-dot" cx="${x(lastKnot[0])}" cy="${y(lastKnot[1])}" r="5"/>`);
      const label = account === breachAccount ? `⚠ ${account} hit its floor here` : `⚠ run stopped — ${breachAccount} hit its floor`;
      const lx = Math.min(x(lastKnot[0]) + 8, W - MARGIN.right - 150);
      parts.push(`<text class="breach-label" x="${lx}" y="${y(lastKnot[1]) - 10}">${label}</text>`);
    } else if (stoppedAtExit) {
      parts.push(`<circle class="end-dot" cx="${x(lastKnot[0])}" cy="${y(lastKnot[1])}" r="4"/>`);
      const lx = Math.min(x(lastKnot[0]) + 8, W - MARGIN.right - 150);
      parts.push(`<text class="end-label" x="${lx}" y="${y(lastKnot[1]) - 10}">✓ simulation ends here</text>`);
    } else {
      parts.push(`<circle class="end-dot" cx="${x(lastKnot[0])}" cy="${y(lastKnot[1])}" r="4"/>`);
    }

    const sYear = Math.min(view.scrubYear, max);
    const sValNominal = interpAt(data.points, sYear);
    parts.push(`<line class="crosshair" x1="${x(sYear)}" x2="${x(sYear)}" y1="${MARGIN.top}" y2="${H - MARGIN.bottom}"/>`);
    parts.push(`<circle class="hover-dot" cx="${x(sYear)}" cy="${y(sValNominal)}" r="5"/>`);

    // one flag per milestone actually reached within the visible horizon --
    // anchored above the line, not on it, since it's marking a date, not a
    // value. Colour flips live as the scrub handle passes it, same "ticked"
    // logic the Milestones list below uses.
    const flagY = MARGIN.top + 11;
    for (const [name, whenReached] of completedGoals) {
      const gYear = daysBetween(start, whenReached) / 365.25;
      if (gYear > max) continue;
      const gx = x(gYear);
      const reached = gYear <= sYear;
      parts.push(`<line class="m-flag-pole" x1="${gx}" x2="${gx}" y1="${flagY + 3}" y2="${H - MARGIN.bottom}"/>`);
      parts.push(
        `<text class="m-flag${reached ? " reached" : ""}" x="${gx}" y="${flagY}" text-anchor="middle">🚩` +
        `<title>${name} — ${formatDateLong(whenReached)}</title></text>`,
      );
    }

    elements.chartSvg.innerHTML = parts.join("");
    elements.simHeading.innerHTML = simulationHorizonLabel(state.birthdays, start, max);
    elements.balHeading.textContent = `Accounts at ${yearToLabel(sYear)}`;
  }

  function yearToLabel(year: number): string {
    const d = new Date(start);
    d.setDate(d.getDate() + Math.round(year * 365.25));
    return d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }

  /** Five evenly-spaced labels across the track. The horizon is always a
   * multiple of five years, so quarters of it stay whole numbers. */
  function renderTicks(): void {
    const parts: string[] = [];
    for (let i = 0; i <= 4; i++) {
      const year = Math.round((absMax / 4) * i);
      parts.push(`<span>${i === 0 ? "0" : `${year}y`}</span>`);
    }
    elements.timelineTicks.innerHTML = parts.join("");
  }

  function layoutTimeline(): void {
    const max = effectiveMax();
    const reachedPct = (max / absMax) * 100;
    const horizonPct = (view.requestedMax / absMax) * 100;
    const scrubPct = (Math.min(view.scrubYear, max) / absMax) * 100;
    elements.reachedFill.style.width = `${reachedPct}%`;
    if (view.requestedMax > max) {
      elements.neverFill.style.display = "";
      elements.neverFill.style.left = `${reachedPct}%`;
      elements.neverFill.style.width = `${Math.max(0, horizonPct - reachedPct)}%`;
    } else {
      elements.neverFill.style.display = "none";
    }
    elements.scrubHandle.style.left = `${scrubPct}%`;
    elements.horizonHandle.style.left = `${horizonPct}%`;
  }

  // a compact "what moment am I looking at" readout, always visible near
  // the top of the card -- the balances-at-a-date list further down and
  // the Milestones list above it both live below this now, so this is the
  // one place you can see the scrub date + everyone's age without scrolling.
  function renderScrubReadout(state: UIState): void {
    const max = effectiveMax();
    const year = Math.min(view.scrubYear, max);
    const when = addDays(start, Math.round(year * 365.25));
    const ages: string[] = [];
    for (const person of state.birthdays) ages.push(`${person.name} ${ageAtISO(person.born, when)}`);
    elements.scrubReadout.innerHTML =
      `<span class="sr-date">${formatDateLong(when)}</span><span class="sr-ages">${ages.join(" · ")}</span>`;
  }

  /** Grouped by kind -- debts, then savings, then the everyday envelopes --
   * rather than the order they happen to sit in the config. A budget with
   * only one kind of account gets no headings; they'd be labelling nothing. */
  function renderBalances(state: UIState): void {
    elements.balRows.innerHTML = "";
    const max = effectiveMax();
    const year = Math.min(view.scrubYear, max);
    const groups = groupAccounts(state.accounts);

    for (const group of groups) {
      if (groups.length > 1) {
        const heading = document.createElement("div");
        heading.className = "bal-group";
        heading.textContent = group.label;
        elements.balRows.appendChild(heading);
      }
      for (const account of group.accounts) {
        const data = series[account.name];
        if (!data) continue;
        const value = deflate(interpAt(data.points, Math.min(year, max)), year);
        const row = document.createElement("div");
        row.className = "bal-row" + (account.name === elements.acctSelect.value ? " selected" : "");
        row.innerHTML = `<span class="bn"><span class="swatch"></span>${account.name}</span><span class="bv fig">${money(value)}</span>`;
        elements.balRows.appendChild(row);
      }
    }
  }

  function renderMilestones(state: UIState): void {
    elements.milestoneRows.innerHTML = "";

    const entries: Array<{ goal: UIGoal; year: number; when: ISODate | null }> = [];
    for (const goal of state.goals) {
      let year = Infinity;
      let when: ISODate | null = null;
      for (const [name, whenReached] of completedGoals) {
        if (name === goal.name) { when = whenReached; year = daysBetween(start, whenReached) / 365.25; }
      }
      entries.push({ goal, year, when });
    }

    for (const { goal, year, when } of sortMilestones(entries)) {
      const reached = when !== null && view.scrubYear >= year;
      const row = document.createElement("div");
      row.className = "milestone-row compact " + (reached ? "ticked" : "crossed");
      let whenHTML = "";
      if (reached && when !== null) {
        const ages: string[] = [];
        for (const person of state.birthdays) ages.push(`${person.name} ${ageAtISO(person.born, when)}`);
        whenHTML = `<div class="m-when">${formatDateLong(when)}<span class="m-ages">${ages.join(" · ")}</span></div>`;
      }
      const triggerLabel = goal.trigger === "balance" ? `${goal.account} reaches ${goal.target}`
        : goal.trigger === "date" ? `on ${goal.by}`
        : `${goal.byAgePerson} turns ${goal.byAgeTurns}`;
      row.innerHTML =
        `<span class="m-mark">${reached ? "✓" : "✗"}</span>` +
        `<div class="m-info"><div class="m-name">${goal.name}</div><div class="m-trigger">${triggerLabel}</div></div>` +
        whenHTML;
      elements.milestoneRows.appendChild(row);
    }
  }

  function formatDateLong(iso: ISODate): string {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function moveScrubTo(year: number): void {
    view.scrubYear = Math.max(0, Math.min(effectiveMax(), year));
  }

  function setHorizon(year: number): void {
    view.requestedMax = Math.max(1, Math.min(absMax, year));
  }

  function trackYearFromClientX(clientX: number): number {
    const rect = elements.track.getBoundingClientRect();
    const frac = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(absMax, frac * absMax));
  }

  return {
    /** Runs the real simulator against the current state and redraws
     * everything -- called whenever anything in the page changes. */
    recompute(state: UIState, showImpact = false): void {
      const before = lastOutcome;
      const budget = toBudget(state);
      start = todayISO();
      // editing a birthday moves the far end of the timeline, so this is
      // worked out fresh each run rather than fixed at startup
      const previousMax = absMax;
      absMax = horizonYears(state.birthdays, start);
      if (view.requestedMax === previousMax) view.requestedMax = absMax;
      view.requestedMax = Math.min(view.requestedMax, absMax);
      renderTicks();
      const end = addDays(start, Math.round(absMax * 365.25));
      const trackNames = state.accounts.map((a) => a.name);
      const result = run(budget, start, end, trackNames);
      const { history, completed, phases, endedOn } = result;
      const worst = breaches(budget, result)[0];
      const floorStopped = worst !== undefined && (endedOn === null || worst.on < endedOn);
      const visibleCompleted = completedThrough(completed, floorStopped ? worst.on : null);
      terminalYear = floorStopped || !endedOn ? Infinity : daysBetween(start, endedOn) / 365.25;
      const terminalGoal = !floorStopped && endedOn
          ? budget.goals.find((goal) => goal.exit && completed.some(([name, when]) => name === goal.name && when === endedOn))
          : undefined;
      terminalAccount = terminalGoal?.account ?? null;
      elements.terminalStatus.classList.toggle("floor-stop", floorStopped);
      elements.terminalStatus.textContent = floorStopped
        ? `Simulation stopped: ${worst.account} fell under its floor of ${money(worst.floor)} on ${formatDateLong(worst.on)}`
        : terminalGoal && endedOn
          ? `Simulation ended: ${terminalGoal.name}` +
            (terminalGoal.target !== null ? ` reached ${money(terminalGoal.target)}` : "") +
            ` on ${formatDateLong(endedOn)}`
          : "";
      lastPhases = phases;
      lastBudget = budget;
      const current: PlanOutcome = { budget, result, start, end };
      lastOutcome = current;
      const checked = checkPlan(budget, result, start, end);
      const firstProblem = checked.findings[0];
      elements.planStatus.textContent = firstProblem
        ? `${firstProblem.severity.toUpperCase()}: ${firstProblem.account} — ${firstProblem.detail}.`
        : "PASS: no mechanical findings";
      if (showImpact && before) {
        if (firstProblem?.rule === "account-below-floor") {
          elements.impactStatus.textContent =
            `Cashflow failure: ${firstProblem.account} — ${firstProblem.detail}. Later milestones are not assessed.`;
        } else {
          const text = formatImpact(compareOutcomes(before, current));
          const accumulation = checked.findings.find((finding) => finding.rule === "clearing-account-accumulating");
          elements.impactStatus.textContent = accumulation && text.startsWith("No named milestone moved")
            ? `${text} in ${accumulation.account}`
            : text;
        }
      } else if (!showImpact) elements.impactStatus.textContent = "";

      series = {};
      for (const account of state.accounts) {
        const days: History[string] = history[account.name] ?? [];
        series[account.name] = { floor: account.floor, points: yearPoints(days, start) };
      }

      // The run already worked out how low every account got and when, so
      // this reads that rather than scanning for it again. Two detectors for
      // one fact is two chances to disagree -- and the linter reports this
      // same breach, from these same numbers, under account-below-floor.
      breachYear = floorStopped && worst ? daysBetween(start, worst.on) / 365.25 : Infinity;
      breachAccount = floorStopped && worst ? worst.account : null;

      const selected = autoSelectedAccount(pickedByHand, trackNames, breachAccount, terminalAccount);
      if (selected) elements.acctSelect.value = selected;

      moveScrubTo(defaultScrubYear(visibleCompleted, start, breachYear));
      refresh(state, visibleCompleted);
    },

    bindControls(state: UIState, onChange: () => void): void {
      let dragging: "scrub" | "horizon" | null = null;
      elements.scrubHandle.addEventListener("pointerdown", (evt) => { dragging = "scrub"; evt.preventDefault(); });
      elements.horizonHandle.addEventListener("pointerdown", (evt) => { dragging = "horizon"; evt.preventDefault(); });
      elements.track.addEventListener("pointerdown", (evt) => {
        if (evt.target === elements.scrubHandle || evt.target === elements.horizonHandle) return;
        moveScrubTo(trackYearFromClientX(evt.clientX));
        refresh(state, completedGoals);
      });
      window.addEventListener("pointermove", (evt) => {
        if (!dragging) return;
        const year = trackYearFromClientX(evt.clientX);
        if (dragging === "scrub") moveScrubTo(year); else setHorizon(year);
        refresh(state, completedGoals);
      });
      window.addEventListener("pointerup", () => { dragging = null; });

      elements.scrubHandle.addEventListener("keydown", (evt) => {
        if (evt.key === "ArrowLeft") { moveScrubTo(view.scrubYear - 0.5); refresh(state, completedGoals); evt.preventDefault(); }
        if (evt.key === "ArrowRight") { moveScrubTo(view.scrubYear + 0.5); refresh(state, completedGoals); evt.preventDefault(); }
      });
      elements.horizonHandle.addEventListener("keydown", (evt) => {
        if (evt.key === "ArrowLeft") { setHorizon(view.requestedMax - 1); refresh(state, completedGoals); evt.preventDefault(); }
        if (evt.key === "ArrowRight") { setHorizon(view.requestedMax + 1); refresh(state, completedGoals); evt.preventDefault(); }
      });

      elements.chartSvg.addEventListener("pointermove", (evt) => {
        const rect = elements.chartSvg.getBoundingClientRect();
        const scale = rect.width / W;
        const svgX = (evt.clientX - rect.left) / scale;
        const year = ((svgX - MARGIN.left) / PLOT_W) * view.requestedMax;
        moveScrubTo(year);
        refresh(state, completedGoals);
      });

      elements.acctSelect.addEventListener("change", () => {
        pickedByHand = true;
        view.scrubYear = 0;
        refresh(state, completedGoals);
      });
      elements.inflationInput.addEventListener("input", () => {
        state.inflation = inflationRate();
        onChange();
      });

      elements.dollarButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          view.dollars = btn.dataset.mode as "future" | "today";
          // The selector appears beside both the flow table and account
          // snapshot. They share one display mode, so keep both pairs in
          // sync rather than leaving the other control stale.
          elements.dollarButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === view.dollars));
          refresh(state, completedGoals);
        });
      });
      elements.cadenceButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          view.cadence = btn.dataset.cadence as FlowCadence;
          elements.cadenceButtons.forEach((b) => b.classList.toggle("active", b === btn));
          renderFlowPanel();
        });
      });
    },

    populateAccountSelect(state: UIState): void {
      const previous = elements.acctSelect.value;
      elements.acctSelect.innerHTML = "";
      for (const account of state.accounts) {
        const option = document.createElement("option");
        option.value = account.name;
        option.textContent = account.name;
        elements.acctSelect.appendChild(option);
      }
      if ([...elements.acctSelect.options].some((o) => o.value === previous)) elements.acctSelect.value = previous;
    },
  };
}
