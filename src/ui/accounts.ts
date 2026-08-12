import { removeAccount, renameAccount, type UIAccount, type UIState } from "../state";
import { canOffset } from "../model";
import { confirmRemove, removeButtonHTML } from "./remove-button";

/** Ordered the way someone adding an account thinks, not alphabetically:
 * the everyday two first, then the three that hold money, then debt. The
 * parenthetical is doing real work -- "sinking" and "clearing" are the two
 * nobody arrives already knowing. */
const KIND_LABELS: Array<[UIAccount["kind"], string]> = [
  ["expense", "Spending (an envelope)"],
  ["clearing", "Clearing (pay lands here)"],
  ["sinking", "Sinking fund (saves up, spends down)"],
  ["saving", "Saving (towards a target)"],
  ["investment", "Investment (super, shares)"],
  ["loan", "Loan"],
];

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return entities[character];
  });
}

function kindLabel(kind: UIAccount["kind"]): string {
  return KIND_LABELS.find(([value]) => value === kind)![1];
}

function formatBalance(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function accountSummaryText(account: UIAccount): string {
  return `${kindLabel(account.kind)} · ${formatBalance(account.balance)}`;
}

function kindSelectHTML(kind: UIAccount["kind"]): string {
  let html = '<select class="field-input acct-kind">';
  for (const [value, label] of KIND_LABELS) {
    html += `<option value="${value}"${value === kind ? " selected" : ""}>${label}</option>`;
  }
  return html + "</select>";
}

function offsetSelectHTML(account: UIAccount, loanNames: string[]): string {
  const disabled = !canOffset(account.kind);
  let html = `<select class="field-input"${disabled ? " disabled" : ""}>`;
  html += `<option value=""${!account.offsets ? " selected" : ""}>— none —</option>`;
  for (const name of loanNames) {
    html += `<option${account.offsets === name ? " selected" : ""}>${name}</option>`;
  }
  return html + "</select>";
}

/** `redrawAll` rather than just re-rendering this section: an account's name
 * shows up in Transfers' From/To boxes and inside every goal's override
 * list, so renaming or removing one has to redraw those too or they sit
 * there showing a name that no longer exists. */
export function renderAccounts(container: HTMLElement, state: UIState, onChange: () => void, redrawAll: () => void, expandName?: string): void {
  const activeElement = document.activeElement as HTMLElement | null;
  const activeAccountName = activeElement?.closest<HTMLElement>(".account-row")?.dataset.accountName;
  const activeField = activeElement?.classList.contains("acct-kind") ? "kind" : activeElement?.dataset.field;
  const expandedNames = new Set(
    Array.from(container.querySelectorAll<HTMLElement>(".account-row.mobile-expanded"), (row) => row.dataset.accountName),
  );
  container.innerHTML = "";
  const loanNames = state.accounts.filter((a) => a.kind === "loan").map((a) => a.name);

  for (let i = 0; i < state.accounts.length; i++) {
    const account = state.accounts[i];
    const row = document.createElement("div");
    row.className = "account-row";
    row.dataset.accountName = account.name;
    row.innerHTML =
      `<div class="account-summary">` +
      `<span class="account-summary-name">${escapeHTML(account.name)}</span>` +
      `<span class="account-summary-kind" data-account-kind>${kindLabel(account.kind)}</span>` +
      `<span class="account-summary-balance fig" data-account-balance>${formatBalance(account.balance)}</span>` +
      `<button type="button" class="mobile-toggle" data-mobile-toggle aria-expanded="false" aria-label="Edit ${escapeHTML(account.name)}">Edit</button>` +
      `</div>` +
      `<div class="account-fields">` +
      `<div class="mobile-field" data-label="Name"><input class="field-input a-name" data-field="name" value="${escapeHTML(account.name)}"></div>` +
      `<div class="mobile-field" data-label="Kind">${kindSelectHTML(account.kind)}</div>` +
      `<div class="mobile-field" data-label="Opening balance"><input class="field-input fig" data-field="balance" value="${account.balance}"></div>` +
      `<div class="mobile-field" data-label="Interest rate"><input class="field-input fig" data-field="rate" value="${(account.rate * 100).toFixed(1)}%"></div>` +
      `<div class="mobile-field" data-label="Floor"><input class="field-input fig" data-field="floor" value="${account.floor}"></div>` +
      `<div class="mobile-field" data-label="Offsets"><div class="a-field offset">${offsetSelectHTML(account, loanNames)}</div></div>` +
      `</div>` +
      removeButtonHTML(account.name);
    container.appendChild(row);
    if (expandedNames.has(account.name) || expandName === account.name) {
      row.classList.add("mobile-expanded");
      const restoredToggle = row.querySelector<HTMLButtonElement>("[data-mobile-toggle]")!;
      restoredToggle.setAttribute("aria-expanded", "true");
      restoredToggle.textContent = "Done";
    }

    const nameInput = row.querySelector<HTMLInputElement>('[data-field="name"]')!;
    const kindSelect = row.querySelector<HTMLSelectElement>(".acct-kind")!;
    const balanceInput = row.querySelector<HTMLInputElement>('[data-field="balance"]')!;
    const rateInput = row.querySelector<HTMLInputElement>('[data-field="rate"]')!;
    const floorInput = row.querySelector<HTMLInputElement>('[data-field="floor"]')!;
    const offsetSelect = row.querySelector<HTMLSelectElement>(".a-field.offset select")!;
    const removeBtn = row.querySelector<HTMLButtonElement>("[data-remove]")!;
    const mobileToggle = row.querySelector<HTMLButtonElement>("[data-mobile-toggle]")!;

    mobileToggle.addEventListener("click", () => {
      const expanded = row.classList.toggle("mobile-expanded");
      mobileToggle.setAttribute("aria-expanded", String(expanded));
      mobileToggle.textContent = expanded ? "Done" : "Edit";
    });
    if (activeAccountName === account.name && activeField) {
      const focusTarget = activeField === "kind"
        ? row.querySelector<HTMLElement>(".acct-kind")
        : row.querySelector<HTMLElement>(`[data-field="${activeField}"]`);
      focusTarget?.focus();
    }
    if (expandName === account.name) nameInput.focus();

    // on change, not input -- cascading a half-typed name through every
    // transfer and goal that references it would rewrite them all on each
    // keystroke. A name that's blank or already taken is refused, and the
    // field goes back to what it was.
    nameInput.addEventListener("change", () => {
      if (!renameAccount(state, account.name, nameInput.value)) {
        nameInput.value = account.name;
        return;
      }
      redrawAll();
      onChange();
    });
    kindSelect.addEventListener("change", () => {
      account.kind = kindSelect.value as UIAccount["kind"];
      if (!canOffset(account.kind)) account.offsets = null;
      renderAccounts(container, state, onChange, redrawAll);
      onChange();
    });
    balanceInput.addEventListener("input", () => {
      const parsed = parseFloat(balanceInput.value.replace(/,/g, ""));
      account.balance = isNaN(parsed) ? 0 : parsed;
      row.querySelector<HTMLElement>("[data-account-balance]")!.textContent = formatBalance(account.balance);
      onChange();
    });
    rateInput.addEventListener("input", () => {
      const parsed = parseFloat(rateInput.value.replace("%", ""));
      account.rate = isNaN(parsed) ? 0 : parsed / 100;
      onChange();
    });
    floorInput.addEventListener("input", () => {
      const parsed = parseFloat(floorInput.value.replace(/,/g, ""));
      account.floor = isNaN(parsed) ? 0 : parsed;
      onChange();
    });
    offsetSelect.addEventListener("change", () => {
      account.offsets = offsetSelect.value || null;
      onChange();
    });
    removeBtn.addEventListener("click", () => {
      if (!confirmRemove(account.name)) return;
      removeAccount(state, account.name);
      redrawAll();
      onChange();
    });
  }
}
