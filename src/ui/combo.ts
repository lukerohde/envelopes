/** A typed account combobox for every From/To field -- filters the known
 * account names as you type, or lets you type a brand-new name to create
 * one. Rows get rebuilt whenever a section re-renders, so this runs again
 * each time rather than once at load.
 *
 * The list is positioned `fixed` and placed by hand against the input's own
 * rectangle. It used to be `absolute`, which meant the scroll container the
 * rows live in clipped it -- `overflow-x: auto` computes `overflow-y` to
 * `auto` as well, so the dropdown on the bottom row was cut off by the pane
 * it sat in. A fixed element isn't clipped by an ancestor's overflow at all.
 */

export type ComboCreate = (name: string, field: "from" | "to") => void;

export function initCombos(container: HTMLElement, accountNames: string[], onCreate?: ComboCreate): void {
  document.querySelectorAll<HTMLElement>("[data-combo-list]").forEach((list) => list.remove());
  container.querySelectorAll<HTMLElement>("[data-combo]").forEach((el) => {
    const input = el.querySelector<HTMLInputElement>(".combo-input");
    if (!input) return;

    const list = document.createElement("div");
    list.className = "combo-list";
    list.dataset.comboList = "";
    list.hidden = true;
    document.body.appendChild(list);

    /** Anchored under the input, or above it when there isn't room below --
     * the bottom row of a long list is exactly where this matters. */
    function place(): void {
      const rect = input!.getBoundingClientRect();
      list.style.left = `${rect.left}px`;
      list.style.width = `${rect.width}px`;
      const height = list.offsetHeight;
      const roomBelow = window.innerHeight - rect.bottom;
      const fitsAbove = rect.top > height + 8;
      list.style.top = roomBelow < height + 8 && fitsAbove
        ? `${rect.top - height - 4}px`
        : `${rect.bottom + 4}px`;
    }

    function renderList(): void {
      const query = input!.value.trim();
      const matches = accountNames.filter((name) => name.toLowerCase().includes(query.toLowerCase()));
      list.innerHTML = "";

      // A missing `out_of` is external income, not a missing account. Keep it
      // as an explicit choice in the From picker, including after the user
      // clears the field, so they never have to type a magic string or
      // accidentally create an account called "external income".
      const externalIncome = input!.dataset.field === "from" &&
        "external income".includes(query.toLowerCase());
      if (externalIncome) {
        const item = document.createElement("div");
        item.className = "combo-item combo-special";
        item.textContent = "External income (no source account)";
        item.addEventListener("mousedown", (evt) => {
          evt.preventDefault();
          input!.value = "external income";
          input!.dispatchEvent(new Event("input", { bubbles: true }));
          input!.dispatchEvent(new Event("change", { bubbles: true }));
          hide();
        });
        list.appendChild(item);
      }
      for (const name of matches) {
        const item = document.createElement("div");
        item.className = "combo-item";
        item.textContent = name;
        item.addEventListener("mousedown", (evt) => {
          evt.preventDefault();
          input!.value = name;
          input!.dispatchEvent(new Event("input", { bubbles: true }));
          input!.dispatchEvent(new Event("change", { bubbles: true }));
          hide();
        });
        list.appendChild(item);
      }
      const exists = accountNames.some((name) => name.toLowerCase() === query.toLowerCase()) || externalIncome;
      if (query && !exists) {
        const create = document.createElement("div");
        create.className = "combo-item combo-create";
        create.textContent = onCreate ? `+ Add account “${query}”` : `+ Add “${query}” in Accounts`;
        create.addEventListener("mousedown", (evt) => {
          evt.preventDefault();
          input!.value = query;
          input!.dispatchEvent(new Event("input", { bubbles: true }));
          input!.dispatchEvent(new Event("change", { bubbles: true }));
          onCreate?.(query, input!.dataset.field as "from" | "to");
          hide();
        });
        list.appendChild(create);
      }
    }

    // capture, so scrolling the pane the row sits in counts too, not just
    // the page -- a fixed list doesn't move with its input on its own
    function show(): void {
      if (!list.isConnected) document.body.appendChild(list);
      renderList();
      list.hidden = false;
      place();
      window.addEventListener("scroll", place, true);
      window.addEventListener("resize", place);
    }

    function hide(): void {
      list.hidden = true;
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    }

    input.addEventListener("focus", show);
    input.addEventListener("input", show);
    input.addEventListener("blur", () => setTimeout(hide, 150));
  });
}
