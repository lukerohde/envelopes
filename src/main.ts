import { initialState, nextName, stateToYamlText, type UIState } from "./state";
import { aiPromptFor } from "./ui/ai-prompt";
import { renderPeople } from "./ui/people";
import { renderAccounts } from "./ui/accounts";
import { renderHead, renderTransfers } from "./ui/transfers";
import { renderGoals } from "./ui/goals";
import { createSimulationView } from "./ui/simulation";
import { initIO, stateFromShareHash } from "./ui/io";
import { debounce } from "./debounce";
import { todayISO } from "./dates";

function main(state: UIState): void {
  const peopleRows = document.querySelector<HTMLElement>("#peopleRows")!;
  const accountRows = document.querySelector<HTMLElement>("#accountRows")!;
  const transferRows = document.querySelector<HTMLElement>("#transferRows")!;
  const goalRows = document.querySelector<HTMLElement>("#goalRows")!;
  renderHead(document.querySelector<HTMLElement>("#transferHead")!);

  const simulation = createSimulationView({
    acctSelect: document.querySelector<HTMLSelectElement>("#acctSelect")!,
    inflationInput: document.querySelector<HTMLInputElement>("#inflationInput")!,
    autoBadge: document.querySelector<HTMLElement>("#autoBadge")!,
    simHeading: document.querySelector<HTMLElement>("#simHeading")!,
    chartSvg: document.querySelector<SVGSVGElement>("#chartSvg")!,
    track: document.querySelector<HTMLElement>("#track")!,
    reachedFill: document.querySelector<HTMLElement>("#reachedFill")!,
    neverFill: document.querySelector<HTMLElement>("#neverFill")!,
    scrubHandle: document.querySelector<HTMLElement>("#scrubHandle")!,
    horizonHandle: document.querySelector<HTMLElement>("#horizonHandle")!,
    balHeading: document.querySelector<HTMLElement>("#balHeading")!,
    balRows: document.querySelector<HTMLElement>("#balRows")!,
    flowRows: document.querySelector<HTMLElement>("#flowRows")!,
    scrubReadout: document.querySelector<HTMLElement>("#scrubReadout")!,
    milestoneRows: document.querySelector<HTMLElement>("#milestoneRows")!,
    timelineTicks: document.querySelector<HTMLElement>("#timelineTicks")!,
    impactStatus: document.querySelector<HTMLElement>("#impactStatus")!,
    planStatus: document.querySelector<HTMLElement>("#planStatus")!,
    dollarButtons: document.querySelectorAll<HTMLButtonElement>(".dt-btn"),
    cadenceButtons: document.querySelectorAll<HTMLButtonElement>(".cadence-btn"),
  });

  // every edit anywhere on the page funnels through here: re-run the real
  // simulator against the current state, redraw the chart/timeline/
  // balances/milestones. Sections that changed their own shape (added a
  // row, changed a goal's trigger type) re-render themselves separately;
  // this is only ever about the simulation results. Debounced -- a full
  // recompute reruns the whole 40-year simulation (~150ms), which is fine
  // once, but would stutter if it ran on every single keystroke of a fast
  // typist.
  function update(showImpact = false): void {
    simulation.populateAccountSelect(state);
    simulation.recompute(state, showImpact);
  }

  // Everything a user actually changes goes through here rather than
  // update() directly: the recompute, plus pushing the new state into the
  // address bar so a link copied from it is never a stale snapshot. Boot's
  // own first update() deliberately isn't an edit.
  function edited(showImpact = true): void {
    io.markEdited();
    update(showImpact);
  }
  const scheduleUpdate = debounce(edited, 200);

  function renderAll(): void {
    renderPeople(peopleRows, state, scheduleUpdate);
    renderAccounts(accountRows, state, scheduleUpdate, renderAll);
    renderTransfers(transferRows, state, scheduleUpdate, renderAll);
    renderGoals(goalRows, state, scheduleUpdate);
    document.querySelector<HTMLInputElement>("#inflationInput")!.value = `${(state.inflation * 100).toFixed(1)}%`;
  }
  renderAll();

  // Load / a raw-YAML edit / a decoded share link all land here: the same
  // `state` object gets its fields overwritten in place (not replaced --
  // every row's closures above already captured this exact object) and
  // every section rebuilds against it.
  function applyLoadedState(next: UIState): void {
    state.inflation = next.inflation;
    state.birthdays = next.birthdays;
    state.accounts = next.accounts;
    state.transfers = next.transfers;
    state.goals = next.goals;
    renderAll();
    edited(false);
  }

  const io = initIO(
    {
      toggleRawBtn: document.querySelector<HTMLButtonElement>("#toggleRaw")!,
      structuredView: document.querySelector<HTMLElement>("#structuredView")!,
      rawSection: document.querySelector<HTMLElement>("#rawSection")!,
      rawYaml: document.querySelector<HTMLTextAreaElement>("#rawYaml")!,
      rawStatus: document.querySelector<HTMLElement>("#rawStatus")!,
      loadBtn: document.querySelector<HTMLButtonElement>("#loadBtn")!,
      loadFile: document.querySelector<HTMLInputElement>("#loadFile")!,
      saveBtn: document.querySelector<HTMLButtonElement>("#saveBtn")!,
      shareBtn: document.querySelector<HTMLButtonElement>("#shareBtn")!,
      ioStatus: document.querySelector<HTMLElement>("#ioStatus")!,
      keepBar: document.querySelector<HTMLElement>("#keepBar")!,
    },
    state,
    applyLoadedState,
  );

  const aiPromptCopy = document.querySelector<HTMLButtonElement>("#aiPromptCopy")!;
  const aiPromptStatus = document.querySelector<HTMLElement>("#aiPromptStatus")!;
  const aiPromptText = document.querySelector<HTMLTextAreaElement>("#aiPromptText")!;

  // Rebuilt from the address bar each time it's shown or copied, never
  // captured once at load -- io.ts rewrites the fragment on every edit, so
  // anything held from earlier would hand over a stale plan. Refreshing on
  // open as well as on copy keeps what's on screen honest about what the
  // button will put on the clipboard.
  function refreshPrompt(): void {
    aiPromptText.value = aiPromptFor(location.href, stateToYamlText(state));
  }
  aiPromptText.closest("details")!.addEventListener("toggle", refreshPrompt);
  refreshPrompt();

  aiPromptCopy.addEventListener("click", () => {
    refreshPrompt();
    navigator.clipboard.writeText(aiPromptText.value).then(
      () => { aiPromptStatus.textContent = "Copied"; setTimeout(() => { aiPromptStatus.textContent = ""; }, 3000); },
      (err) => { aiPromptStatus.textContent = `Couldn't copy: ${(err as Error).message}`; },
    );
  });

  // adding a row is a discrete click, not a keystroke mid-typing -- no
  // reason to delay it, so these call edited() directly rather than going
  // through the debounced scheduleUpdate.
  document.querySelector("#addPerson")!.addEventListener("click", () => {
    const name = nextName("New person", state.birthdays);
    state.birthdays.push({ name, born: "1990-01-01" });
    renderPeople(peopleRows, state, scheduleUpdate, name, state.birthdays.length - 1);
    edited();
  });

  document.querySelector("#addAccount")!.addEventListener("click", () => {
    const name = nextName("new account", state.accounts);
    state.accounts.push({ name, balance: 0, floor: 0, kind: "expense", rate: 0, offsets: null });
    renderAccounts(accountRows, state, scheduleUpdate, renderAll, name);
    edited();
  });

  document.querySelector("#addTransfer")!.addEventListener("click", () => {
    // a fortnightly transfer's day is an anchor date, not a weekday -- the
    // old "Fri" default was a value no schedule could ever match
    const name = nextName("new transfer", state.transfers);
    state.transfers.push({ name, amount: 0, every: "fortnight", day: todayISO(), out_of: null, into: null, escalates: true });
    renderTransfers(transferRows, state, scheduleUpdate, renderAll, name);
    edited();
  });

  document.querySelector("#addGoal")!.addEventListener("click", () => {
    const name = nextName("New goal", state.goals);
    state.goals.push({
      name, trigger: "age", account: state.accounts[0]?.name ?? "", target: 0, waitForBoth: false,
      by: "", byAgePerson: state.birthdays[0]?.name ?? "", byAgeTurns: 65,
      transfers: [], accounts: [], editing: true,
    });
    renderGoals(goalRows, state, scheduleUpdate, undefined, name);
    edited();
  });

  simulation.bindControls(state, scheduleUpdate);
  update();
}

// A share link wins over example.yaml if the URL's fragment decodes to a
// real config -- checked once, before the first render.
async function boot(): Promise<void> {
  const shared = await stateFromShareHash(location.hash.slice(1));
  main(shared ?? initialState());
}

boot();
