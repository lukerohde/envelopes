import { ageAt, EARLIEST_BIRTHDAY, todayISO } from "../dates";
import type { UIPerson, UIState } from "../state";
import { wireDateClamp } from "./date-input";
import { confirmRemove, removeButtonHTML } from "./remove-button";

export function personSummaryHTML(person: UIPerson, today: string): string {
  return (
    `<div class="person-summary"><span class="person-name">${person.name || "Unnamed person"}</span>` +
    `<span class="age"><span class="age-n fig">${ageAt(person.born, today)}</span><span class="age-l">years old</span></span>` +
    `<button type="button" class="m-edit-btn" data-edit>Edit</button></div>`
  );
}

export function renderPeople(container: HTMLElement, state: UIState, onChange: () => void, focusName?: string, editingIndex?: number): void {
  container.innerHTML = "";
  const today = todayISO();

  for (let i = 0; i < state.birthdays.length; i++) {
    const person = state.birthdays[i];
    const row = document.createElement("div");
    row.className = "person-row" + (editingIndex === i ? " editing" : "");
    row.innerHTML =
      personSummaryHTML(person, today) +
      `<div class="person-fields"><input class="field-input" type="text" data-field="name" aria-label="Name" value="${person.name}">` +
      `<input class="field-input" type="date" data-field="born" aria-label="Birthday" value="${person.born}" min="${EARLIEST_BIRTHDAY}" max="${today}">` +
      `<button type="button" class="save-link" data-save>Done</button></div>` +
      removeButtonHTML(person.name);
    container.appendChild(row);

    const nameInput = row.querySelector<HTMLInputElement>('[data-field="name"]')!;
    const bornInput = row.querySelector<HTMLInputElement>('[data-field="born"]')!;
    const removeBtn = row.querySelector<HTMLButtonElement>("[data-remove]")!;
    wireDateClamp(bornInput, EARLIEST_BIRTHDAY, today);
    nameInput.addEventListener("input", () => {
      state.birthdays[i].name = nameInput.value;
      onChange();
    });
    bornInput.addEventListener("input", () => {
      state.birthdays[i].born = bornInput.value;
      renderPeople(container, state, onChange, undefined, i);
      onChange();
    });
    if (editingIndex === i || focusName === person.name) nameInput.focus();
    row.querySelector<HTMLButtonElement>("[data-edit]")?.addEventListener("click", () => {
      renderPeople(container, state, onChange, undefined, i);
    });
    row.querySelector<HTMLButtonElement>("[data-save]")?.addEventListener("click", () => {
      renderPeople(container, state, onChange);
    });
    removeBtn.addEventListener("click", () => {
      if (!confirmRemove(person.name)) return;
      state.birthdays.splice(i, 1);
      renderPeople(container, state, onChange);
      onChange();
    });
  }
}
