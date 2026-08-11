import { ageAt, EARLIEST_BIRTHDAY, todayISO } from "../dates";
import type { UIState } from "../state";
import { wireDateClamp } from "./date-input";
import { confirmRemove, removeButtonHTML } from "./remove-button";

export function renderPeople(container: HTMLElement, state: UIState, onChange: () => void, focusName?: string): void {
  container.innerHTML = "";
  const today = todayISO();

  for (let i = 0; i < state.birthdays.length; i++) {
    const person = state.birthdays[i];
    const row = document.createElement("div");
    row.className = "person-row";
    row.innerHTML =
      `<input class="field-input" type="text" data-field="name" value="${person.name}">` +
      `<input class="field-input" type="date" data-field="born" value="${person.born}" min="${EARLIEST_BIRTHDAY}" max="${today}">` +
      `<span class="age"><span class="age-n fig">${ageAt(person.born, today)}</span><span class="age-l">years old</span></span>` +
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
      renderPeople(container, state, onChange);
      onChange();
    });
    if (focusName === person.name) nameInput.focus();
    removeBtn.addEventListener("click", () => {
      if (!confirmRemove(person.name)) return;
      state.birthdays.splice(i, 1);
      renderPeople(container, state, onChange);
      onChange();
    });
  }
}
