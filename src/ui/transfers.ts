import { renameTransfer, type UIState, type UITransfer } from "../state";
import { dayForEvery, transferFieldsHTML, transferHeadHTML, wireTransferFieldRow, type RowFields } from "./transfer-fields";
import { initCombos } from "./combo";
import { confirmRemove, removeButtonHTML } from "./remove-button";

function toRowFields(transfer: UITransfer, state: UIState): RowFields {
  return {
    name: transfer.name,
    from: transfer.out_of || "external income",
    to: transfer.into || "",
    mode: transfer.sweep_above === undefined ? "fixed" : "sweep",
    amount: transfer.sweep_above ?? transfer.amount,
    every: transfer.every,
    day: transfer.day,
    escalates: transfer.escalates,
    sweepAllowed: state.accounts.some((account) => account.name === transfer.out_of && account.kind === "clearing"),
  };
}

/** Sets one field on a real transfer, given the row's plain string key --
 * the row doesn't know about out_of/into, only "from" and "to". The name is
 * not here: renaming cascades into goal overrides, so it's wired separately
 * below. */
export function setTransferField(transfer: UITransfer, key: string, value: string | boolean, state: UIState): void {
  if (key === "from") {
    transfer.out_of = value === "external income" ? null : (value as string);
    if (transfer.sweep_above !== undefined && !state.accounts.some((account) => account.name === transfer.out_of && account.kind === "clearing")) {
      transfer.amount = transfer.sweep_above;
      delete transfer.sweep_above;
    }
  }
  else if (key === "to") transfer.into = (value as string) || null;
  else if (key === "mode") {
    const amount = transfer.sweep_above ?? transfer.amount;
    if (value === "sweep") {
      transfer.sweep_above = amount;
      transfer.amount = 0;
    } else {
      transfer.amount = amount;
      delete transfer.sweep_above;
    }
  }
  else if (key === "amount") {
    const amount = parseFloat(String(value).replace(/,/g, "")) || 0;
    if (transfer.sweep_above === undefined) transfer.amount = amount;
    else transfer.sweep_above = amount;
  }
  else if (key === "every") {
    transfer.every = value as string;
    transfer.day = dayForEvery(transfer.every, transfer.day);
  }
  else if (key === "day") transfer.day = value as string;
  else if (key === "escalates") transfer.escalates = value as boolean;
}

export function renderHead(container: HTMLElement): void {
  container.innerHTML = transferHeadHTML();
}

/** `redrawAll` for the same reason as Accounts: a transfer's name appears
 * inside every goal's override list, so renaming one has to redraw those. */
export function renderTransfers(container: HTMLElement, state: UIState, onChange: () => void, redrawAll: () => void, expandName?: string): void {
  const activeElement = document.activeElement as HTMLElement | null;
  const activeTransferName = activeElement?.closest<HTMLElement>(".transfer-row")?.dataset.transferName;
  const activeField = activeElement?.dataset.field;
  const expandedNames = new Set(
    Array.from(container.querySelectorAll<HTMLElement>(".transfer-row.mobile-expanded"), (row) => row.dataset.transferName),
  );
  container.innerHTML = "";

  for (let i = 0; i < state.transfers.length; i++) {
    const transfer = state.transfers[i];
    const wrap = document.createElement("div");
    wrap.className = "transfer-row-wrap";
    wrap.innerHTML =
      `<div class="transfer-row" data-transfer-name="${transfer.name}">${transferFieldsHTML(toRowFields(transfer, state), { nameEditable: true })}</div>` +
      removeButtonHTML(transfer.name);
    container.appendChild(wrap);

    wireTransferFieldRow(
      wrap.querySelector<HTMLElement>(".transfer-row")!,
      (key, value) => setTransferField(transfer, key, value, state),
      () => renderTransfers(container, state, onChange, redrawAll),
      onChange,
    );

    if (expandedNames.has(transfer.name) || expandName === transfer.name) {
      const transferRow = wrap.querySelector<HTMLElement>(".transfer-row")!;
      const toggle = transferRow.querySelector<HTMLButtonElement>("[data-mobile-toggle]")!;
      transferRow.classList.add("mobile-expanded");
      toggle.setAttribute("aria-expanded", "true");
      toggle.textContent = "Done";
    }
    if (activeTransferName === transfer.name && activeField) {
      wrap.querySelector<HTMLElement>(`[data-field="${activeField}"]`)?.focus();
    }

    // on change, not input -- same reasoning as an account's name: a
    // half-typed name shouldn't propagate into goal overrides on every
    // keystroke. A blank or already-taken name is refused and reverted.
    const nameInput = wrap.querySelector<HTMLInputElement>('[data-field="name"]')!;
    if (expandName === transfer.name) nameInput.focus();
    nameInput.addEventListener("change", () => {
      if (!renameTransfer(state, transfer.name, nameInput.value)) {
        nameInput.value = transfer.name;
        return;
      }
      redrawAll();
      onChange();
    });

    wrap.querySelector<HTMLButtonElement>("[data-remove]")!.addEventListener("click", () => {
      if (!confirmRemove(transfer.name)) return;
      state.transfers.splice(i, 1);
      renderTransfers(container, state, onChange, redrawAll);
      onChange();
    });
  }

  initCombos(container, state.accounts.map((a) => a.name), (name, field) => {
    if (state.accounts.some((account) => account.name === name)) return;
    state.accounts.push({
      name,
      balance: 0,
      floor: 0,
      // A newly created From account is the household's pay/clearing account;
      // a newly created To account is an envelope until the user changes it.
      kind: field === "from" ? "clearing" : "expense",
      rate: 0,
      offsets: null,
    });
    redrawAll();
    onChange();
  });
}
